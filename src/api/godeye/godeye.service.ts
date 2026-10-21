// @ts-nocheck -- hot loops over typed-array columns; the repo's noUncheckedIndexedAccess would need a non-null assertion on every index.
// All database access lives in godeye.queries.ts, which is fully type checked.
import { queryRecentTransfers, queryTransfers } from './godeye.queries';
import { COUNTERPART_SYMBOLS, GodEyeLedgers, TokenLedger, ledgers as ledgerStore } from './godeye.ledger';
import { GodEyeLabels, labels as labelStore } from './godeye.labels';
import {
	GodEyeAddress,
	GodEyeCounterpart,
	GodEyeEdge,
	GodEyeGraph,
	GodEyeHolders,
	GodEyeJourney,
	GodEyeJourneyDay,
	GodEyeJourneyPeer,
	GodEyeKind,
	GodEyeKindStats,
	GodEyeNode,
	GodEyeOrigin,
	GodEyePeer,
	GodEyeTimelinePoint,
	GodEyeTokenInfo,
	GodEyeTransfers,
} from './godeye.types';

/** carries an http status, mapped to a response by the router */
export class HttpError extends Error {
	constructor(
		readonly status: 400 | 404,
		message: string
	) {
		super(message);
	}
}

const DUST = 0.005; // below half a cent an account does not count as holder
const DAY = 86400;
const KINDS: GodEyeKind[] = ['mint', 'wallet', 'position', 'minter', 'savings', 'equity', 'bridge', 'dex', 'exchange', 'contract', 'others'];

export type GraphQuery = {
	token?: string;
	chainId?: number;
	at?: number;
	/** seconds, 0 = cumulative since genesis */
	window?: number;
	top?: number;
	rank?: 'balance' | 'volume';
	mode?: 'entities' | 'categories';
	focus?: string;
	minAmount?: number;
};

export class GodEyeService {
	private timelineCache = new Map<string, { version: number; data: GodEyeTimelinePoint[] }>();

	constructor(
		private readonly ledgers: GodEyeLedgers = ledgerStore,
		private readonly labels: GodEyeLabels = labelStore
	) {}

	/** waits for the first ledger load, refreshes in the background afterwards */
	async ready() {
		await Promise.all([this.ledgers.ensure(), this.labels.ready()]);
	}

	// ------------------------------------------------------------------ helpers
	private ledger(token?: string, chainId?: number): TokenLedger {
		const l = this.ledgers.resolve(token, chainId);
		if (!l) throw new HttpError(404, `Token ledger not available (yet): ${token || 'USDU'}. The indexer sync may still be running.`);
		return l;
	}

	private info(l: TokenLedger): GodEyeTokenInfo {
		return this.ledgers.info(l);
	}

	private kindIndex(chainId: number): Uint8Array {
		const n = this.ledgers.addrs.length;
		const out = new Uint8Array(n);
		for (let i = 0; i < n; i++) out[i] = KINDS.indexOf(this.labels.resolve(this.ledgers.addrs[i], chainId).kind);
		return out;
	}

	private peer(chainId: number, id: number, amount: number, count: number, last: number): GodEyePeer {
		const address = this.ledgers.addrs[id];
		const l = this.labels.resolve(address, chainId);
		return { address, label: l.label, kind: l.kind, amount, count, last };
	}

	private replay(l: TokenLedger, hi: number): Float64Array {
		const bal = new Float64Array(this.ledgers.addrs.length);
		for (let i = 0; i < hi; i++) {
			bal[l.from[i]] -= l.amt[i];
			bal[l.to[i]] += l.amt[i];
		}
		return bal;
	}

	// ------------------------------------------------------------------ overview
	getTokens() {
		return { sync: this.ledgers.status(), tokens: this.ledgers.tokens() };
	}

	// ------------------------------------------------------------------ address book
	getAddressBook(chainId?: number) {
		return this.labels.getAddressBook(chainId);
	}

	// ------------------------------------------------------------------ timeline
	getTimeline(token?: string, chainId?: number): GodEyeTimelinePoint[] {
		const l = this.ledger(token, chainId);
		const hit = this.timelineCache.get(l.key);
		if (hit && hit.version === l.version) return hit.data;
		if (!l.n) return [];

		const bal = new Float64Array(this.ledgers.addrs.length);
		const out: GodEyeTimelinePoint[] = [];
		let holders = 0;
		let day = Math.floor(l.ts[0] / DAY);
		let volume = 0;
		let minted = 0;
		let burned = 0;
		let transfers = 0;
		const emit = (d: number) => out.push({ t: (d + 1) * DAY - 1, supply: -bal[0], holders, volume, minted, burned, transfers });

		for (let i = 0; i < l.n; i++) {
			const d = Math.floor(l.ts[i] / DAY);
			while (d > day) {
				emit(day);
				day++;
				volume = minted = burned = transfers = 0;
			}
			const f = l.from[i];
			const t = l.to[i];
			const a = l.amt[i];
			if (f !== 0) {
				const was = bal[f] > DUST;
				bal[f] -= a;
				if (was && !(bal[f] > DUST)) holders--;
			} else {
				bal[0] -= a;
				minted += a;
			}
			if (t !== 0) {
				const was = bal[t] > DUST;
				bal[t] += a;
				if (!was && bal[t] > DUST) holders++;
			} else {
				bal[0] += a;
				burned += a;
			}
			// the second leg of a mint/burn routed through a module is the same movement, count it once
			if (l.via[i] !== 2) {
				volume += a;
				transfers++;
			}
		}
		emit(day);
		this.timelineCache.set(l.key, { version: l.version, data: out });
		return out;
	}

	// ------------------------------------------------------------------ holders
	getHolders(token?: string, chainId?: number, at?: number, limit = 100, offset = 0): GodEyeHolders {
		const l = this.ledger(token, chainId);
		const ts = at || (l.n ? l.ts[l.n - 1] : 0);
		const hi = l.upperBound(ts);
		const bal = this.replay(l, hi);
		const supply = -bal[0];

		const ids: number[] = [];
		for (let i = 1; i < bal.length; i++) if (bal[i] > DUST) ids.push(i);
		ids.sort((a, b) => bal[b] - bal[a]);

		const share = (n: number) => (supply > 0 ? ids.slice(0, n).reduce((s, i) => s + bal[i], 0) / supply : 0);
		const edges = [100, 1_000, 10_000, 100_000, 1_000_000, Infinity];
		const names = ['< 100', '100 – 1k', '1k – 10k', '10k – 100k', '100k – 1M', '> 1M'];
		const buckets = names.map((label) => ({ label, holders: 0, balance: 0 }));
		for (const i of ids) {
			const b = edges.findIndex((e) => bal[i] < e);
			buckets[b].holders++;
			buckets[b].balance += bal[i];
		}

		const first = new Map<number, number>();
		const want = new Set(ids.slice(offset, offset + limit));
		for (let i = 0; i < hi && first.size < want.size; i++) {
			if (want.has(l.to[i]) && !first.has(l.to[i])) first.set(l.to[i], l.ts[i]);
		}

		return {
			at: ts,
			supply,
			holders: ids.length,
			top1: share(1),
			top10: share(10),
			top100: share(100),
			buckets,
			total: ids.length,
			list: ids.slice(offset, offset + limit).map((i) => {
				const lab = this.labels.resolve(this.ledgers.addrs[i], l.chainId);
				return {
					address: this.ledgers.addrs[i],
					label: lab.label,
					kind: lab.kind,
					balance: bal[i],
					share: supply > 0 ? bal[i] / supply : 0,
					since: first.get(i) || 0,
				};
			}),
		};
	}

	// ------------------------------------------------------------------ graph
	getGraph(q: GraphQuery): GodEyeGraph {
		const l = this.ledger(q.token, q.chainId);
		const info = this.info(l);
		const last = l.n ? l.ts[l.n - 1] : 0;
		const at = q.at && q.at < last ? q.at : last;
		const hi = l.upperBound(at);
		const win = q.window > 0 ? q.window : 0;
		const fromTs = win ? at - win : 0;
		const lo = win ? l.lowerBound(fromTs) : 0;
		const mode = q.mode === 'categories' ? 'categories' : 'entities';
		const top = Math.max(5, Math.min(q.top || 80, 400));
		const rank = q.rank === 'volume' ? 'volume' : 'balance';
		const minAmount = q.minAmount || 0;

		const N = this.ledgers.addrs.length;
		const kindOf = this.kindIndex(l.chainId);

		// pass 1: balances, windowed volume, first/last seen
		const bal = new Float64Array(N);
		const vin = new Float64Array(N);
		const vout = new Float64Array(N);
		const txs = new Uint32Array(N);
		const first = new Uint32Array(N);
		const lastSeen = new Uint32Array(N);
		let windowVolume = 0;
		for (let i = 0; i < hi; i++) {
			const f = l.from[i];
			const t = l.to[i];
			const a = l.amt[i];
			bal[f] -= a;
			bal[t] += a;
			if (!first[f]) first[f] = l.ts[i];
			if (!first[t]) first[t] = l.ts[i];
			lastSeen[f] = lastSeen[t] = l.ts[i];
			if (i >= lo) {
				vout[f] += a;
				vin[t] += a;
				txs[f]++;
				txs[t]++;
				windowVolume += a;
			}
		}
		const supply = -bal[0];
		let holders = 0;
		for (let i = 1; i < N; i++) if (bal[i] > DUST) holders++;

		const kinds: GodEyeKindStats[] = KINDS.map((kind) => ({ kind, addresses: 0, balance: 0, inflow: 0, outflow: 0 }));
		for (let i = 0; i < N; i++) {
			if (!txs[i] && !(bal[i] > DUST)) continue;
			const k = kinds[kindOf[i]];
			if (i !== 0 && bal[i] > DUST) {
				k.addresses++;
				k.balance += bal[i];
			}
			k.inflow += vin[i];
			k.outflow += vout[i];
		}

		const nodeOf = (id: number): GodEyeNode => {
			const address = this.ledgers.addrs[id];
			const lab = this.labels.resolve(address, l.chainId);
			return {
				id: address,
				label: lab.label,
				kind: lab.kind,
				balance: id === 0 ? 0 : Math.max(bal[id], 0),
				share: id !== 0 && supply > 0 ? Math.max(bal[id], 0) / supply : 0,
				inflow: vin[id],
				outflow: vout[id],
				txs: txs[id],
				first: first[id],
				last: lastSeen[id],
			};
		};

		// ------------------------------------------------ categories
		if (mode === 'categories') {
			const present = KINDS.map((_, k) => k).filter((k) => kinds[k].addresses || kinds[k].inflow || kinds[k].outflow);
			const edgeMap = new Map<number, GodEyeEdge>();
			for (let i = lo; i < hi; i++) {
				const s = kindOf[l.from[i]];
				const t = kindOf[l.to[i]];
				const key = s * 64 + t;
				let e = edgeMap.get(key);
				if (!e) edgeMap.set(key, (e = { s: KINDS[s], t: KINDS[t], amount: 0, count: 0, first: l.ts[i], last: 0 }));
				e.amount += l.amt[i];
				e.count++;
				e.last = l.ts[i];
			}
			const nodes: GodEyeNode[] = present.map((k) => ({
				id: KINDS[k],
				label: KINDS[k],
				kind: KINDS[k],
				balance: kinds[k].balance,
				share: supply > 0 ? kinds[k].balance / supply : 0,
				inflow: kinds[k].inflow,
				outflow: kinds[k].outflow,
				txs: kinds[k].addresses,
				first: 0,
				last: at,
			}));
			return {
				token: info,
				mode,
				at,
				from: fromTs,
				supply,
				holders,
				totalNodes: nodes.length,
				coverage: 1,
				nodes,
				edges: [...edgeMap.values()].filter((e) => e.amount >= minAmount),
				kinds,
			};
		}

		// ------------------------------------------------ entities: node selection
		const focusId = q.focus ? this.ledgers.findId(q.focus) : undefined;
		if (q.focus && focusId === undefined) throw new HttpError(404, `Address not seen in ${info.symbol} ledger`);

		const score = new Float64Array(N);
		let candidates: number[] = [];
		if (focusId !== undefined) {
			for (let i = lo; i < hi; i++) {
				if (l.from[i] === focusId) score[l.to[i]] += l.amt[i];
				else if (l.to[i] === focusId) score[l.from[i]] += l.amt[i];
			}
			for (let i = 0; i < N; i++) if (i !== focusId && score[i] > 0) candidates.push(i);
		} else {
			for (let i = 1; i < N; i++) {
				const s = rank === 'balance' ? bal[i] : vin[i] + vout[i];
				if (rank === 'balance' ? s > DUST : s > 0) {
					score[i] = s;
					candidates.push(i);
				}
			}
		}
		candidates.sort((a, b) => score[b] - score[a]);
		const picked = candidates.slice(0, top);
		if (focusId === undefined) {
			// modules that mint/burn on behalf of users net to zero balance and would vanish into "rest of network";
			// keep the busiest ones (by routed volume in the window) so mint -> module -> user stays visible
			const routed = new Map<number, number>();
			for (let i = lo; i < hi; i++) if (l.via[i] === 1) routed.set(l.to[i], (routed.get(l.to[i]) || 0) + l.amt[i]);
			const have = new Set(picked);
			for (const [id] of [...routed.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) if (!have.has(id) && id !== 0) picked.push(id);
		}
		const slot = new Int32Array(N).fill(-1);
		const ids: number[] = [];
		const add = (id: number) => {
			if (slot[id] < 0) {
				slot[id] = ids.length;
				ids.push(id);
			}
		};
		if (focusId !== undefined) add(focusId);
		for (const id of picked) add(id);
		// the mint/burn source is part of every map unless it never touched a selected node
		add(0);

		// ------------------------------------------------ pass 2: edges among selected nodes
		const OTHERS = ids.length;
		const M = ids.length + 1;
		const edgeMap = new Map<number, GodEyeEdge & { si: number; ti: number }>();
		let shown = 0;
		let othersUsed = false;
		const showOthers = focusId === undefined;
		for (let i = lo; i < hi; i++) {
			let s = slot[l.from[i]];
			let t = slot[l.to[i]];
			if (s < 0 && t < 0) continue;
			if (s < 0) {
				if (!showOthers) continue;
				s = OTHERS;
			}
			if (t < 0) {
				if (!showOthers) continue;
				t = OTHERS;
			}
			if (s === OTHERS || t === OTHERS) othersUsed = true;
			else shown += l.amt[i];
			const key = s * M + t;
			let e = edgeMap.get(key);
			if (!e) edgeMap.set(key, (e = { s: '', t: '', si: s, ti: t, amount: 0, count: 0, first: l.ts[i], last: 0 }));
			e.amount += l.amt[i];
			e.count++;
			e.last = l.ts[i];
			if (l.via[i]) e.via = true;
			if (l.cp[i]) {
				const symbol = COUNTERPART_SYMBOLS[l.cp[i]];
				const flows = (e.cp ??= []);
				let f = flows.find((x) => x.symbol === symbol);
				if (!f) flows.push((f = { symbol, amount: 0, count: 0 }));
				f.amount += l.cpAmt[i];
				f.count++;
			}
		}

		const nodes: GodEyeNode[] = ids.map(nodeOf);
		let othersNode: GodEyeNode = null;
		if (othersUsed) {
			let rest = 0;
			let restIn = 0;
			let restOut = 0;
			for (let i = 1; i < N; i++) {
				if (slot[i] >= 0) continue;
				if (bal[i] > DUST) rest += bal[i];
				restIn += vin[i];
				restOut += vout[i];
			}
			othersNode = {
				id: 'others',
				label: 'Rest of network',
				kind: 'others',
				balance: rest,
				share: supply > 0 ? rest / supply : 0,
				inflow: restIn,
				outflow: restOut,
				txs: 0,
				first: 0,
				last: at,
			};
			nodes.push(othersNode);
		}
		const idOf = (si: number) => (si === OTHERS ? 'others' : this.ledgers.addrs[ids[si]]);
		const edges: GodEyeEdge[] = [];
		for (const e of edgeMap.values()) {
			if (e.amount < minAmount) continue;
			edges.push({ s: idOf(e.si)!, t: idOf(e.ti)!, amount: e.amount, count: e.count, first: e.first, last: e.last, via: e.via, cp: e.cp });
		}
		edges.sort((a, b) => b.amount - a.amount);

		return {
			token: info,
			mode,
			at,
			from: fromTs,
			supply,
			holders,
			totalNodes: candidates.length,
			coverage: windowVolume > 0 ? shown / windowVolume : 1,
			nodes,
			edges,
			kinds,
			focus: focusId !== undefined ? this.ledgers.addrs[focusId] : undefined,
		};
	}

	// ------------------------------------------------------------------ address history + provenance
	async getAddress(address: string, token?: string, chainId?: number): Promise<GodEyeAddress> {
		const l = this.ledger(token, chainId);
		const id = this.ledgers.findId(address);
		if (id === undefined) throw new HttpError(404, `Address ${address} has no ${l.symbol} activity`);

		type Peer = { in: number; out: number; cin: number; cout: number; last: number };
		const peers = new Map<number, Peer>();
		const events: { t: number; b: number }[] = [];
		const cps = new Map<number, GodEyeCounterpart>();
		let bal = 0;
		let inflow = 0;
		let outflow = 0;
		let minted = 0;
		let burned = 0;
		let txs = 0;
		let first = 0;
		let lastTs = 0;

		for (let i = 0; i < l.n; i++) {
			const f = l.from[i];
			const t = l.to[i];
			if (f !== id && t !== id) continue;
			const a = l.amt[i];
			const peerId = f === id ? t : f;
			let p = peers.get(peerId);
			if (!p) peers.set(peerId, (p = { in: 0, out: 0, cin: 0, cout: 0, last: 0 }));
			if (t === id) {
				bal += a;
				inflow += a;
				p.in += a;
				p.cin++;
				if (f === 0) minted += a;
			}
			if (f === id) {
				bal -= a;
				outflow += a;
				p.out += a;
				p.cout++;
				if (t === 0) burned += a;
			}
			p.last = l.ts[i];
			if (l.cp[i] && id !== 0) {
				// counted once per swap: the receiving leg of a mint (the module itself on its first leg), the paying leg of a burn
				const v = l.via[i];
				const paid = (v === 2 && t === id) || (v === 1 && f === 0 && t === id);
				const received = (v === 1 && f === id) || (v === 2 && t === 0 && f === id);
				if (paid || received) {
					let c = cps.get(l.cp[i]);
					if (!c) cps.set(l.cp[i], (c = { symbol: COUNTERPART_SYMBOLS[l.cp[i]], paid: 0, received: 0, count: 0, last: 0 }));
					if (paid) c.paid += l.cpAmt[i];
					else c.received += l.cpAmt[i];
					c.count++;
					c.last = l.ts[i];
				}
			}
			txs++;
			if (!first) first = l.ts[i];
			lastTs = l.ts[i];
			events.push({ t: l.ts[i], b: bal });
		}

		// one point per day, then thin out
		const daily: { t: number; balance: number }[] = [];
		for (const e of events) {
			const d = Math.floor(e.t / DAY) * DAY;
			const prev = daily[daily.length - 1];
			if (prev && prev.t === d) prev.balance = e.b;
			else daily.push({ t: d, balance: e.b });
		}
		const step = Math.max(1, Math.ceil(daily.length / 300));
		const history = daily.filter((_, i) => i % step === 0 || i === daily.length - 1);

		const arr = [...peers.entries()];
		const sources = arr
			.filter(([, p]) => p.in > 0)
			.sort((a, b) => b[1].in - a[1].in)
			.slice(0, 12)
			.map(([pid, p]) => this.peer(l.chainId, pid, p.in, p.cin, p.last));
		const destinations = arr
			.filter(([, p]) => p.out > 0)
			.sort((a, b) => b[1].out - a[1].out)
			.slice(0, 12)
			.map(([pid, p]) => this.peer(l.chainId, pid, p.out, p.cout, p.last));

		// second hop: who funded the biggest funders
		const topSources = arr
			.filter(([, p]) => p.in > 0)
			.sort((a, b) => b[1].in - a[1].in)
			.slice(0, 6)
			.map(([pid]) => pid);
		const hop = new Map<number, Map<number, Peer>>(topSources.map((s) => [s, new Map()]));
		if (topSources.length) {
			for (let i = 0; i < l.n; i++) {
				const m = hop.get(l.to[i]);
				if (!m) continue;
				let p = m.get(l.from[i]);
				if (!p) m.set(l.from[i], (p = { in: 0, out: 0, cin: 0, cout: 0, last: 0 }));
				p.in += l.amt[i];
				p.cin++;
				p.last = l.ts[i];
			}
		}
		const origin: GodEyeOrigin[] = topSources.map((s) => {
			const p = peers.get(s);
			const via = [...hop.get(s).entries()!]
				.sort((a, b) => b[1].in - a[1].in)
				.slice(0, 5)
				.map(([pid, hp]) => this.peer(l.chainId, pid, hp.in, hp.cin, hp.last));
			return { ...this.peer(l.chainId, s, p.in, p.cin, p.last), via };
		});

		const ts = l.n ? l.ts[l.n - 1] : 0;
		const supply = -this.replay(l, l.n)[0];
		const lab = this.labels.resolve(address, l.chainId);

		return {
			address: address.toLowerCase(),
			label: lab.label,
			kind: lab.kind,
			token: this.info(l),
			balance: id === 0 ? supply : bal,
			share: id !== 0 && supply > 0 ? bal / supply : 0,
			inflow,
			outflow,
			minted,
			burned,
			txs,
			first,
			last: lastTs || ts,
			history,
			sources,
			destinations,
			origin,
			counterparts: [...cps.values()].sort((a, b) => b.paid + b.received - (a.paid + a.received)),
			recent: await this.recentTransfers(l, address),
		};
	}

	/** day-by-day activity of one address, the data behind the timeline view */
	getJourney(address: string, token?: string, chainId?: number): GodEyeJourney {
		const l = this.ledger(token, chainId);
		const id = this.ledgers.findId(address);
		if (id === undefined) throw new NotFoundException(`Address ${address} has no ${l.symbol} activity`);

		const PEERS_PER_DAY = 8;
		type Acc = { day: GodEyeJourneyDay; by: Map<number, { in: number; out: number; count: number }> };
		const accs: Acc[] = [];
		let bal = 0;
		let cur: Acc | undefined;

		for (let i = 0; i < l.n; i++) {
			const f = l.from[i];
			const t = l.to[i];
			if (f !== id && t !== id) continue;
			const d = Math.floor(l.ts[i] / DAY) * DAY;
			if (!cur || cur.day.t !== d) {
				cur = { day: { t: d, in: 0, out: 0, txs: 0, balance: 0, peers: [] }, by: new Map() };
				accs.push(cur);
			}
			const a = l.amt[i];
			const peerId = f === id ? t : f;
			let p = cur.by.get(peerId);
			if (!p) cur.by.set(peerId, (p = { in: 0, out: 0, count: 0 }));
			if (t === id) {
				bal += a;
				cur.day.in += a;
				p.in += a;
			}
			if (f === id) {
				bal -= a;
				cur.day.out += a;
				p.out += a;
			}
			p.count++;
			cur.day.txs++;
			cur.day.balance = bal;
		}

		const peers: GodEyeJourneyPeer[] = [];
		const index = new Map<number, number>();
		const days = accs.map(({ day, by }) => {
			day.peers = [...by.entries()]
				.sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out))
				.slice(0, PEERS_PER_DAY)
				.map(([pid, p]) => {
					let i = index.get(pid);
					if (i === undefined) {
						const addr = this.ledgers.addrs[pid];
						const lab = this.labels.resolve(addr, l.chainId);
						i = peers.push({ address: addr, label: lab.label, kind: lab.kind }) - 1;
						index.set(pid, i);
					}
					return { i, ...p };
				});
			return day;
		});

		const self = this.labels.resolve(address, l.chainId);
		return { address: address.toLowerCase(), label: self.label, kind: self.kind, token: this.info(l), peers, days };
	}

	/** the raw transfers behind one day (or any window) of an address, optionally narrowed to one counterparty; tx hashes are read from the indexer table */
	async getTransfers(address: string, token?: string, chainId?: number, from?: number, to?: number, peer?: string): Promise<GodEyeTransfers> {
		const l = this.ledger(token, chainId);
		const a = address.toLowerCase();
		if (!/^0x[0-9a-f]{40}$/.test(a)) throw new HttpError(400, 'Invalid address');
		const p = peer ? peer.toLowerCase() : undefined;
		if (p && !/^0x[0-9a-f]{40}$/.test(p)) throw new HttpError(400, 'Invalid peer');
		if (from === undefined || to === undefined || !(to > from) || to - from > 366 * DAY) throw new HttpError(400, 'from/to must be unix seconds spanning at most one year');

		const LIMIT = 100;
		let items = await queryTransfers(l.chainId, l.token, a, from, to, LIMIT + 1, p);
		let peerMatched = true;
		if (p && !items.length) {
			items = await queryTransfers(l.chainId, l.token, a, from, to, LIMIT + 1);
			peerMatched = false;
		}
		return {
			address: a,
			token: this.info(l),
			from,
			to,
			peerMatched,
			more: items.length > LIMIT,
			transfers: items.slice(0, LIMIT).map((i) => {
				const other = i.from.toLowerCase() === a ? i.to.toLowerCase() : i.from.toLowerCase();
				const lab = this.labels.resolve(other, l.chainId);
				return {
					txHash: i.txHash,
					t: Number(i.created),
					from: i.from,
					to: i.to,
					amount: Number(i.amount) / 1e18,
					peer: { address: other, label: lab.label, kind: lab.kind },
				};
			}),
		};
	}

	private async recentTransfers(l: TokenLedger, address: string) {
		try {
			const rows = await queryRecentTransfers(l.chainId, l.token, address, 25);
			return rows.map((i) => ({ txHash: i.txHash, t: Number(i.created), from: i.from, to: i.to, amount: Number(i.amount) / 1e18 }));
		} catch {
			return [];
		}
	}

	// ------------------------------------------------------------------ search
	search(term: string, token?: string, chainId?: number) {
		const l = this.ledger(token, chainId);
		const t = term.trim().toLowerCase();
		if (!t) return [];
		const out: { address: string; label: string | null; kind: GodEyeKind }[] = [];
		const seen = new Set<number>();
		for (let i = 0; i < l.n && out.length < 12; i++) {
			for (const id of [l.from[i], l.to[i]]) {
				if (seen.has(id)) continue;
				seen.add(id);
				const address = this.ledgers.addrs[id];
				const lab = this.labels.resolve(address, l.chainId);
				if (address.startsWith(t)! || (lab.label && lab.label.toLowerCase().includes(t))) {
					out.push({ address, label: lab.label, kind: lab.kind });
					if (out.length >= 12) break;
				}
			}
		}
		return out;
	}
}

