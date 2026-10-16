import { db } from 'ponder:api';
import { ERC20Balance } from 'ponder:schema';
import { and, asc, desc, eq, gte, lt, or } from 'ponder';

export type RawTransfer = { txHash: string; created: bigint; from: string; to: string; amount: bigint };

const COLS = { txHash: ERC20Balance.txHash, created: ERC20Balance.created, from: ERC20Balance.from, to: ERC20Balance.to, amount: ERC20Balance.amount };

/** transfers of `account` inside [from, to), optionally only with `peer`, oldest first, `limit` rows */
export async function queryTransfers(
	chainId: number,
	token: string,
	account: string,
	from: number,
	to: number,
	limit: number,
	peer?: string
): Promise<RawTransfer[]> {
	const a = account.toLowerCase() as `0x${string}`;
	const p = peer?.toLowerCase() as `0x${string}` | undefined;
	const match = p
		? or(and(eq(ERC20Balance.from, a), eq(ERC20Balance.to, p)), and(eq(ERC20Balance.from, p), eq(ERC20Balance.to, a)))
		: or(eq(ERC20Balance.from, a), eq(ERC20Balance.to, a));
	return db
		.select(COLS)
		.from(ERC20Balance)
		.where(
			and(
				eq(ERC20Balance.chainId, chainId),
				eq(ERC20Balance.token, token as `0x${string}`),
				gte(ERC20Balance.created, BigInt(Math.floor(from))),
				lt(ERC20Balance.created, BigInt(Math.floor(to))),
				match
			)
		)
		.orderBy(asc(ERC20Balance.count))
		.limit(limit);
}

/** the latest transfers of `account`, newest first */
export async function queryRecentTransfers(chainId: number, token: string, account: string, limit = 25): Promise<RawTransfer[]> {
	const a = account.toLowerCase() as `0x${string}`;
	return db
		.select(COLS)
		.from(ERC20Balance)
		.where(and(eq(ERC20Balance.chainId, chainId), eq(ERC20Balance.token, token as `0x${string}`), or(eq(ERC20Balance.from, a), eq(ERC20Balance.to, a))))
		.orderBy(desc(ERC20Balance.count))
		.limit(limit);
}
