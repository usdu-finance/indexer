import { Event, type Context } from 'ponder:registry';
import { ERC20Balance, ERC20BalanceMapping, ERC20Status } from 'ponder:schema';
import { Address, zeroAddress } from 'viem';

export async function indexERC20Balance(
	event: Event<'ERC20:Transfer' | 'ERC20PositionV1:Transfer' | 'ERC20PositionV2:Transfer'>,
	context: Context<'ERC20:Transfer' | 'ERC20PositionV1:Transfer' | 'ERC20PositionV2:Transfer'>,
	{ indexFrom = true, indexTo = true, indexEntry = true }: { indexFrom?: boolean; indexTo?: boolean; indexEntry?: boolean }
) {
	const token = event.log.address.toLowerCase() as Address;
	const from = event.args.from.toLowerCase() as Address;
	const to = event.args.to.toLowerCase() as Address;
	const value = event.args.value;
	const updated = event.block.timestamp;
	const chainId = context.chain.id;

	// update status
	const status = await context.db
		.insert(ERC20Status)
		.values({
			chainId,
			token,
			updated,
			mint: 0n,
			burn: 0n,
			balance: 1n, // count
			supply: 0n,
		})
		.onConflictDoUpdate((current) => ({
			updated,
			balance: current.balance + 1n, // count
		}));

	// make latest balance available
	let balanceFrom = 0n;
	let balanceTo = 0n;

	// update balance from
	if (from != zeroAddress && indexFrom) {
		const balance = await context.db
			.insert(ERC20BalanceMapping)
			.values({
				chainId,
				token,
				updated,
				account: from,
				mint: 0n,
				burn: 0n,
				// @dev: key not found error while indexing.
				// should not have any balance, but eliminates the "0" amount tranfer errors
				balance: 0n,
			})
			.onConflictDoUpdate((current) => ({
				updated,
				balance: current.balance - value, // deduct balance
			}));
		balanceFrom = balance.balance;
	}

	// update balance to
	if (to != zeroAddress && indexTo) {
		const balance = await context.db
			.insert(ERC20BalanceMapping)
			.values({
				chainId,
				token,
				updated,
				account: to,
				mint: 0n,
				burn: 0n,
				balance: value,
			})
			.onConflictDoUpdate((current) => ({
				updated,
				balance: current.balance + value,
			}));
		balanceTo = balance.balance;
	}

	// index balance history, entry
	if (indexEntry) {
		const entry = await context.db.insert(ERC20Balance).values({
			chainId,
			txHash: event.transaction.hash,
			token,
			created: updated,
			blockheight: event.block.number,
			count: status.balance,
			from,
			to,
			amount: value,
			balanceFrom,
			balanceTo,
		});
	}
}
