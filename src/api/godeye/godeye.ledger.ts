import { db } from 'ponder:api';
import { ERC20Balance, ERC20Status, ModuleRevenueV1Revenue, StablecoinModuleMapping, SwapBridgeMorphoV1Swap } from 'ponder:schema';
import { and, asc, eq, gt, inArray } from 'ponder';
import { ADDRESS } from '@usdu-finance/usdu-core';
import { mainnet } from 'viem/chains';
import { GodEyeTokenInfo } from './godeye.types';

export const ZERO = '0x0000000000000000000000000000000000000000';

export const CHAIN_NAMES: Record<number, string> = {
	1: 'Ethereum',
	10: 'Optimism',
	137: 'Polygon',
	8453: 'Base',
	42161: 'Arbitrum',
};

/** ERC20s whose complete transfer history is mirrored (all are ERC20Balance indexed, see ponder.config.ts) */
const A = ADDRESS[mainnet.id];
export const TRACKED: { chainId: number; token: string; symbol: string }[] = [
	{ chainId: mainnet.id, token: A.usduStable.toLowerCase(), symbol: 'USDU' },
	{ chainId: mainnet.id, token: A.euruStable.toLowerCase(), symbol: 'EURU' },
	{ chainId: mainnet.id, token: A.chfuStable.toLowerCase(), symbol: 'CHFU' },
	{ chainId: mainnet.id, token: A.usduStreamerVaultV1.toLowerCase(), symbol: 'rUSDU' },
	{ chainId: mainnet.id, token: A.euruStreamerVaultV1.toLowerCase(), symbol: 'rEURU' },
	{ chainId: mainnet.id, token: A.chfuStreamerVaultV1.toLowerCase(), symbol: 'rCHFU' },
];
export const DEFAULT_TOKEN = 'USDU';

/**
 * The backing coin a swap module trades the stablecoin against (USDC -> USDU, EURC -> EURU, ...), by module address.
 * The coin itself is not mirrored as a ledger: the swap events carry its amount, which is attached to the mint/burn rows.
 */
export type Counterpart = { symbol: string; decimals: number };
const COUNTERPARTS: [string, Counterpart][] = [
	[A.usduSwapBridgeMorphoV1_steakUSDC_module, { symbol: 'USDC', decimals: 6 }],
	[A.usduSwapBridgeMorphoV1_steakUSDT_module, { symbol: 'USDT', decimals: 6 }],
	[A.euruSwapBridgeMorphoV1_steakEURC_module, { symbol: 'EURC', decimals: 6 }],
	[A.euruSwapBridgeMorphoV1_dEURO_module, { symbol: 'dEURO', decimals: 18 }],
	[A.chfuSwapBridgeMorphoV1_ZCHF_module, { symbol: 'ZCHF', decimals: 18 }],
];
const COUNTERPART_BY_MODULE = new Map(COUNTERPARTS.map(([a, c]) => [a.toLowerCase(), c]));
/** counterpart ids stored per ledger row, 0 = none */
export const COUNTERPART_SYMBOLS: string[] = ['', ...new Set(COUNTERPARTS.map(([, c]) => c.symbol))];

const PAGE = 5000;
/** max tx hashes per IN query */
const IN_CHUNK = 1000;

/** a module that caused (part of) the mints/burns of one transaction, with the stablecoin amounts it emitted */
export type ModuleHit = { module: string; amounts: bigint[]; coins: bigint[] };

const E18 = 1e18;
/** a refresh is triggered by a request once the ledgers are older than this */
const STALE_MS = 30_000;

/**
 * Compact, column oriented transfer store of a single ERC20 on a single chain.
 * Rows are ordered by the indexer's transfer counter and therefore by time.
 */
export class TokenLedger {
	n = 0;
	cap = 0;
	ts!: Uint32Array;
	from!: Uint32Array;
	to!: Uint32Array;
	amt!: Float64Array;
	/** 0 plain transfer, 1 first and 2 second leg of a mint/burn routed through a module (mint: zero -> module -> recipient, burn: payer -> module -> zero) */
	via!: Uint8Array;
	/** counterpart coin of a routed mint/burn (index into COUNTERPART_SYMBOLS, 0 = none) and its amount in whole coins */
	cp!: Uint8Array;
	cpAmt!: Float64Array;

	lastCount = 0n;
	/** indexer transfer counter we are syncing towards */
	target = 0;
	syncedAt = 0;
	/** bumped on every append, used as cache key */
	version = 0;

	constructor(
		readonly chainId: number,
		readonly token: string,
		readonly symbol: string
	) {
		this.grow(1 << 12);
	}

	get key() {
		return `${this.chainId}:${this.token}`;
	}

	private grow(cap: number) {
		const copy = <T extends Uint32Array | Float64Array | Uint8Array>(old: T | undefined, Ctor: new (n: number) => T): T => {
			const next = new Ctor(cap);
			if (old) next.set(old.subarray(0, this.n));
			return next;
		};
		this.ts = copy(this.ts, Uint32Array);
		this.from = copy(this.from, Uint32Array);
		this.to = copy(this.to, Uint32Array);
		this.amt = copy(this.amt, Float64Array);
		this.via = copy(this.via, Uint8Array);
		this.cp = copy(this.cp, Uint8Array);
		this.cpAmt = copy(this.cpAmt, Float64Array);
		this.cap = cap;
	}

	push(ts: number, from: number, to: number, amount: number, via = 0, cp = 0, cpAmt = 0) {
		if (this.n >= this.cap) this.grow(this.cap * 2);
		const i = this.n++;
		this.ts[i] = ts;
		this.from[i] = from;
		this.to[i] = to;
		this.amt[i] = amount;
		this.via[i] = via;
		this.cp[i] = cp;
		this.cpAmt[i] = cpAmt;
		this.version++;
	}

	/** first row index with ts > t */
	upperBound(t: number): number {
		let lo = 0;
		let hi = this.n;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this.ts[mid]! <= t) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}

	/** first row index with ts >= t */
	lowerBound(t: number): number {
		let lo = 0;
		let hi = this.n;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this.ts[mid]! < t) lo = mid + 1;
			else hi = mid;
		}
		return lo;
	}
}

export class GodEyeLedgers {
	readonly ledgers = new Map<string, TokenLedger>();
	readonly addrs: string[] = [ZERO];
	private readonly addrIdx = new Map<string, number>([[ZERO, 0]]);

	private syncing: Promise<void> | null = null;
	private lastRun = 0;
	private lastError: string | null = null;
	private everSynced = false;
	/** `chainId:stablecoin:module` of every module registered on a stablecoin */
	private registered = new Set<string>();

	constructor(private readonly tracked = TRACKED) {
		for (const t of tracked) this.ledgers.set(`${t.chainId}:${t.token}`, new TokenLedger(t.chainId, t.token, t.symbol));
	}

	// ---------------------------------------------------------------- address table
	idOf(address: string): number {
		const a = address.toLowerCase();
		let i = this.addrIdx.get(a);
		if (i === undefined) {
			i = this.addrs.length;
			this.addrs.push(a);
			this.addrIdx.set(a, i);
		}
		return i;
	}

	findId(address: string): number | undefined {
		return this.addrIdx.get(address.toLowerCase());
	}

	// ---------------------------------------------------------------- public accessors
	/** resolves "chainId:token", an address or a bare symbol (USDU, EURU, CHFU, rUSDU, ...), defaults to mainnet USDU */
	resolve(token?: string, chainId?: number): TokenLedger | undefined {
		if (!token) token = DEFAULT_TOKEN;
		const t = token.toLowerCase();
		const direct = this.ledgers.get(t);
		if (direct) return direct;
		const list = [...this.ledgers.values()];
		if (t.startsWith('0x')) return list.find((l) => l.token === t && (chainId ? l.chainId === chainId : true));
		const bySymbol = list.filter((l) => l.symbol.toLowerCase() === t);
		return bySymbol.find((l) => l.chainId === (chainId || 1)) || bySymbol[0];
	}

	status() {
		const list = [...this.ledgers.values()];
		const main = list.filter((l) => l.symbol === DEFAULT_TOKEN && l.chainId === 1);
		const target = main.reduce((a, l) => a + l.target, 0);
		const done = main.reduce((a, l) => a + Math.min(Number(l.lastCount), l.target), 0);
		return {
			syncing: this.syncing !== null,
			phase: this.syncing ? 'ledgers' : 'idle',
			lastRun: this.lastRun,
			lastError: this.lastError,
			ledgers: this.ledgers.size,
			progress: target > 0 ? done / target : 0,
			done,
			target,
			ready: list.some((l) => l.symbol === DEFAULT_TOKEN && l.chainId === 1 && l.n > 0 && Number(l.lastCount) >= l.target),
		};
	}

	tokens(): GodEyeTokenInfo[] {
		return [...this.ledgers.values()].map((l) => this.info(l)).sort((a, b) => b.transfers - a.transfers);
	}

	info(l: TokenLedger): GodEyeTokenInfo {
		return {
			key: l.key,
			chainId: l.chainId,
			chain: CHAIN_NAMES[l.chainId] || String(l.chainId),
			token: l.token,
			symbol: l.symbol,
			transfers: l.n,
			firstTs: l.n ? l.ts[0]! : 0,
			lastTs: l.n ? l.ts[l.n - 1]! : 0,
			syncedAt: l.syncedAt,
		};
	}

	// ---------------------------------------------------------------- sync
	/** first call waits for the initial load, later calls return at once and refresh in the background when stale */
	async ensure(): Promise<void> {
		if (!this.everSynced) {
			await this.sync();
			return;
		}
		if (Date.now() - this.lastRun > STALE_MS) void this.sync();
	}

	sync(): Promise<void> {
		if (this.syncing) return this.syncing;
		this.syncing = this.run().finally(() => {
			this.syncing = null;
		});
		return this.syncing;
	}

	private async run() {
		try {
			const mapping = await db.select().from(StablecoinModuleMapping);
			this.registered = new Set(mapping.map((m) => `${m.chainId}:${m.stablecoin.toLowerCase()}:${m.module.toLowerCase()}`));
			const status = await db.select().from(ERC20Status);
			for (const s of status) {
				const l = this.ledgers.get(`${s.chainId}:${s.token.toLowerCase()}`);
				if (l) l.target = Number(s.balance);
			}
			for (const l of this.ledgers.values()) {
				if (l.lastCount < BigInt(l.target)) await this.syncLedger(l);
				else l.syncedAt = Math.floor(Date.now() / 1000);
			}
			this.lastError = null;
			this.everSynced = true;
		} catch (e: any) {
			this.lastError = String(e?.message || e);
			console.error(`[godeye] ledger sync failed: ${this.lastError}`);
		} finally {
			this.lastRun = Date.now();
		}
	}

	/**
	 * Modules mint and burn directly (swap bridge: zero -> user, user -> zero), which would show as "Mint / Burn" flows.
	 * Mints/burns of a transaction are attributed to the module that caused them, using the module's own indexed events
	 * (swaps, revenue) and only if the module is registered on this very stablecoin. One IN query per table and page.
	 */
	private async moduleHits(l: TokenLedger, items: { txHash: string; from: string; to: string }[]): Promise<Map<string, ModuleHit[]>> {
		const hits = new Map<string, ModuleHit[]>();
		const hashes = [...new Set(items.filter((i) => i.from === ZERO || i.to === ZERO).map((i) => i.txHash.toLowerCase()))];
		if (!hashes.length) return hits;
		const add = (txHash: string, module: string, amounts: bigint[], coins: bigint[]) => {
			module = module.toLowerCase();
			if (!this.registered.has(`${l.chainId}:${l.token}:${module}`)) return;
			const key = txHash.toLowerCase();
			const list = hits.get(key) ?? [];
			const hit = list.find((h) => h.module === module);
			if (hit) {
				hit.amounts.push(...amounts);
				hit.coins.push(...coins);
			} else list.push({ module, amounts, coins });
			hits.set(key, list);
		};
		for (let i = 0; i < hashes.length; i += IN_CHUNK) {
			const chunk = hashes.slice(i, i + IN_CHUNK) as `0x${string}`[];
			const swaps = await db
				.select({ module: SwapBridgeMorphoV1Swap.module, txHash: SwapBridgeMorphoV1Swap.txHash, kind: SwapBridgeMorphoV1Swap.kind, amountStable: SwapBridgeMorphoV1Swap.amountStable, amountCoin: SwapBridgeMorphoV1Swap.amountCoin, fee: SwapBridgeMorphoV1Swap.fee })
				.from(SwapBridgeMorphoV1Swap)
				.where(and(eq(SwapBridgeMorphoV1Swap.chainId, l.chainId), inArray(SwapBridgeMorphoV1Swap.txHash, chunk)));
			// SwapIn mints (amount - fee) to the target and the fee to the curator, SwapOut burns the amount from the caller;
			// the coin amount is the counterpart of the (amount - fee) mint, resp. of the burn. The fee mint has none.
			for (const w of swaps)
				add(w.txHash, w.module, w.kind === 'SwapIn' ? [w.amountStable - w.fee, w.fee] : [w.amountStable], w.kind === 'SwapIn' ? [w.amountCoin, 0n] : [w.amountCoin]);
			const revenue = await db
				.select({ module: ModuleRevenueV1Revenue.module, txHash: ModuleRevenueV1Revenue.txHash, amount: ModuleRevenueV1Revenue.amount })
				.from(ModuleRevenueV1Revenue)
				.where(and(eq(ModuleRevenueV1Revenue.chainId, l.chainId), inArray(ModuleRevenueV1Revenue.txHash, chunk)));
			for (const r of revenue) add(r.txHash, r.module, [r.amount], [0n]);
		}
		return hits;
	}

	/** appends transfer rows; mints/burns with a known module become two rows through the module so that it nets to zero */
	ingest(
		l: TokenLedger,
		items: { count: bigint; txHash?: string; created: bigint; from: string; to: string; amount: bigint }[],
		hits: Map<string, ModuleHit[]> = new Map()
	) {
		for (const it of items) {
			const ts = Number(it.created);
			const amount = Number(it.amount) / E18;
			const cands = it.txHash && (it.from === ZERO || it.to === ZERO) ? hits.get(it.txHash.toLowerCase()) : undefined;
			const hit = cands && (cands.find((h) => h.amounts.includes(it.amount)) ?? cands[0]);
			const m = hit ? this.idOf(hit.module) : 0;
			// the coin paid/received for exactly this mint/burn, only when the amount matched a swap event of the module
			const k = hit ? hit.amounts.indexOf(it.amount) : -1;
			const coin = hit && k >= 0 ? COUNTERPART_BY_MODULE.get(hit.module) : undefined;
			const coinAmt = coin && hit!.coins[k]! > 0n ? Number(hit!.coins[k]) / 10 ** coin.decimals : 0;
			const cp = coinAmt > 0 ? COUNTERPART_SYMBOLS.indexOf(coin!.symbol) : 0;
			if (hit && it.from === ZERO && it.to !== ZERO) {
				l.push(ts, 0, m, amount, 1, cp, coinAmt);
				l.push(ts, m, this.idOf(it.to), amount, 2, cp, coinAmt);
			} else if (hit && it.to === ZERO && it.from !== ZERO) {
				l.push(ts, this.idOf(it.from), m, amount, 1, cp, coinAmt);
				l.push(ts, m, 0, amount, 2, cp, coinAmt);
			} else {
				l.push(ts, this.idOf(it.from), this.idOf(it.to), amount);
			}
			l.lastCount = it.count;
		}
	}

	private async syncLedger(l: TokenLedger) {
		const before = l.n;
		const started = Date.now();
		for (;;) {
			const items = await db
				.select({ count: ERC20Balance.count, txHash: ERC20Balance.txHash, created: ERC20Balance.created, from: ERC20Balance.from, to: ERC20Balance.to, amount: ERC20Balance.amount })
				.from(ERC20Balance)
				.where(and(eq(ERC20Balance.chainId, l.chainId), eq(ERC20Balance.token, l.token as `0x${string}`), gt(ERC20Balance.count, l.lastCount)))
				.orderBy(asc(ERC20Balance.count))
				.limit(PAGE);
			this.ingest(l, items, await this.moduleHits(l, items));
			if (items.length < PAGE) break;
		}
		l.syncedAt = Math.floor(Date.now() / 1000);
		if (l.n > before) console.log(`[godeye] ledger ${l.symbol}@${l.chainId}: +${l.n - before} rows (${l.n} total, ${Date.now() - started}ms)`);
	}
}

export const ledgers = new GodEyeLedgers();
