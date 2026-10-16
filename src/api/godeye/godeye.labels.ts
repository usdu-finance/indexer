import { db } from 'ponder:api';
import { StablecoinModuleMapping } from 'ponder:schema';
import { ADDRESS } from '@usdu-finance/usdu-core';
import { GodEyeAddressBookEntry, GodEyeKind, GodEyeLabel } from './godeye.types';
import addressbook from './godeye.addressbook.json';
import { ZERO } from './godeye.ledger';

/** kinds a curated entry may use ('mint' is the zero address, 'others' is the aggregated rest of the network) */
const BOOK_KINDS: GodEyeKind[] = ['wallet', 'position', 'minter', 'savings', 'equity', 'bridge', 'dex', 'exchange', 'contract'];

/** protocol address config keys -> kind, used for addresses the curated book does not know */
const CONFIG_KINDS: [RegExp, GodEyeKind][] = [
	[/streamer|saving/i, 'savings'],
	[/adapter|module|deployer/i, 'minter'],
	[/bridge|vault/i, 'bridge'],
	[/curve|router|pool|gauge/i, 'dex'],
	[/curator|dao|stable|multisig|delayed|distributor/i, 'contract'],
];

/** module applications carry a free-text message, it tells what a module really is */
const MODULE_KINDS: [RegExp, GodEyeKind][] = [
	[/saving|streamer|reward/i, 'savings'],
	[/adapter|module/i, 'minter'],
	[/curve|pool|swap ?router|uniswap/i, 'dex'],
	[/bridge|morpho|vault|termmax/i, 'bridge'],
];

/** a resolved label, null when the address is unknown */
export type ResolvedLabel = { label: string | null; kind: GodEyeKind };

const humanize = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');

export class GodEyeLabels {
	private book: GodEyeAddressBookEntry[] = [];
	private bookByChain = new Map<string, GodEyeLabel>();
	private bookByAddress = new Map<string, GodEyeLabel>();
	private statics = new Map<string, GodEyeLabel>();
	private dynamic = new Map<string, GodEyeLabel>();
	private dynamicAt = 0;
	private refreshing: Promise<void> | null = null;

	constructor() {
		this.buildStatics();
		this.loadAddressBook();
	}

	/** curated entries from godeye.addressbook.json, invalid rows are skipped with a warning */
	private loadAddressBook() {
		for (const raw of addressbook as any[]) {
			const address = String(raw?.address || '').toLowerCase();
			const chainId = Number(raw?.chainId);
			if (!/^0x[0-9a-f]{40}$/.test(address) || !Number.isInteger(chainId) || !raw?.label || !BOOK_KINDS.includes(raw?.kind)) {
				console.warn(`[godeye] skipping invalid address book entry: ${JSON.stringify(raw)}`);
				continue;
			}
			const key = `${chainId}:${address}`;
			if (this.bookByChain.has(key)) {
				console.warn(`[godeye] duplicate address book entry ${key}, keeping the first`);
				continue;
			}
			const label = { label: String(raw.label), kind: raw.kind as GodEyeKind };
			this.book.push({ chainId, address, ...label });
			this.bookByChain.set(key, label);
			if (!this.bookByAddress.has(address)) this.bookByAddress.set(address, label);
		}
	}

	getAddressBook(chainId?: number): GodEyeAddressBookEntry[] {
		return chainId ? this.book.filter((e) => e.chainId === chainId) : this.book;
	}

	private buildStatics() {
		this.statics.set(ZERO, { label: 'Mint / Burn', kind: 'mint' });
		for (const chain of Object.values(ADDRESS as Record<string, Record<string, unknown>>)) {
			for (const [name, value] of Object.entries(chain)) {
				if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) continue;
				const a = value.toLowerCase();
				if (this.statics.has(a)) continue;
				const kind = CONFIG_KINDS.find(([re]) => re.test(name))?.[1] ?? 'contract';
				this.statics.set(a, { label: humanize(name), kind });
			}
		}
	}

	/** modules authorized on the stablecoins, refreshed in the background at most once a minute */
	private async loadModules() {
		try {
			const rows = await db.select().from(StablecoinModuleMapping);
			const now = Math.floor(Date.now() / 1000);
			const next = new Map<string, GodEyeLabel>();
			for (const m of rows) {
				const a = m.module.toLowerCase();
				const msg = String(m.messageUpdated || m.message || '').replace(/\s+/g, ' ').trim().slice(0, 60);
				const kind = MODULE_KINDS.find(([re]) => re.test(msg))?.[1] ?? 'minter';
				const expired = m.expiredAt > 0n && Number(m.expiredAt) < now;
				next.set(a, { label: `${msg || `Module ${a.slice(0, 8)}`}${expired ? ' (expired)' : ''}`, kind });
			}
			this.dynamic = next;
		} catch {
			// db not ready yet, keep what we have
		}
	}

	/** await once at startup, refresh in the background afterwards */
	async ready() {
		if (!this.dynamicAt) {
			this.dynamicAt = Date.now();
			this.refreshing = this.loadModules();
		} else if (Date.now() - this.dynamicAt > 60_000) {
			this.dynamicAt = Date.now();
			this.refreshing = this.loadModules();
			return;
		}
		await this.refreshing;
	}

	/** curated address book (exact chain first, then the same address on any chain), then the protocol address config, then authorized modules */
	resolve(address: string, chainId?: number): ResolvedLabel {
		const a = address.toLowerCase();
		return (
			(chainId && this.bookByChain.get(`${chainId}:${a}`)) ||
			this.bookByAddress.get(a) ||
			this.statics.get(a) ||
			this.dynamic.get(a) || { label: null, kind: 'wallet' as GodEyeKind }
		);
	}
}

export const labels = new GodEyeLabels();
