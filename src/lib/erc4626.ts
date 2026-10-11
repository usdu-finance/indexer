import { Event, type Context } from 'ponder:registry';
import { ERC4626Daily, ERC4626History, ERC4626Position, ERC4626Status } from 'ponder:schema';
import { Address, erc20Abi, parseAbi } from 'viem';
import { normalizeAddress, timestampStartOfDay } from '../utils/format';

const erc4626ReadAbi = parseAbi(['function totalAssets() view returns (uint256)']);

export async function indexERC4626Deposit(event: Event<'ERC4626:Deposit'>, context: Context<'ERC4626:Deposit'>) {
	const { sender, owner, assets, shares } = event.args;
	await index(event, context, 'Deposit', sender, owner, owner, assets, shares);
}

export async function indexERC4626Withdraw(event: Event<'ERC4626:Withdraw'>, context: Context<'ERC4626:Withdraw'>) {
	const { sender, receiver, owner, assets, shares } = event.args;
	await index(event, context, 'Withdraw', sender, owner, receiver, assets, shares);
}

async function index(
	event: Event<'ERC4626:Deposit' | 'ERC4626:Withdraw'>,
	context: Context<'ERC4626:Deposit'> | Context<'ERC4626:Withdraw'>,
	kind: 'Deposit' | 'Withdraw',
	sender: Address,
	owner: Address,
	receiver: Address,
	assets: bigint,
	shares: bigint
) {
	const chainId = context.chain.id;
	const vault = normalizeAddress(event.log.address);
	const account = normalizeAddress(owner);
	const updated = event.block.timestamp;
	const isDeposit = kind === 'Deposit';

	const status = await context.db
		.insert(ERC4626Status)
		.values({
			chainId,
			vault,
			updated,
			count: 1n,
			deposited: isDeposit ? assets : 0n,
			withdrawn: isDeposit ? 0n : assets,
		})
		.onConflictDoUpdate((current) => ({
			updated,
			count: current.count + 1n,
			deposited: current.deposited + (isDeposit ? assets : 0n),
			withdrawn: current.withdrawn + (isDeposit ? 0n : assets),
		}));

	await context.db.insert(ERC4626History).values({
		chainId,
		vault,
		count: status.count,
		txHash: event.transaction.hash,
		created: updated,
		blockheight: event.block.number,
		kind,
		sender: normalizeAddress(sender),
		owner: account,
		receiver: normalizeAddress(receiver),
		assets,
		shares,
	});

	await context.db
		.insert(ERC4626Position)
		.values({
			chainId,
			vault,
			account,
			updated,
			deposited: isDeposit ? assets : 0n,
			withdrawn: isDeposit ? 0n : assets,
			sharesMinted: isDeposit ? shares : 0n,
			sharesBurned: isDeposit ? 0n : shares,
		})
		.onConflictDoUpdate((current) => ({
			updated,
			deposited: current.deposited + (isDeposit ? assets : 0n),
			withdrawn: current.withdrawn + (isDeposit ? 0n : assets),
			sharesMinted: current.sharesMinted + (isDeposit ? shares : 0n),
			sharesBurned: current.sharesBurned + (isDeposit ? 0n : shares),
		}));
}

export async function indexERC4626Daily(event: Event<'ERC4626Daily:block'>, context: Context<'ERC4626Daily:block'>, vaults: Address[]) {
	const chainId = context.chain.id;
	const day = BigInt(timestampStartOfDay(Number(event.block.timestamp)));

	for (const vault of vaults) {
		// vault may not be deployed yet at the first blocks of the interval
		const [totalAssets, totalSupply] = await Promise.all([
			context.client.readContract({ abi: erc4626ReadAbi, address: vault, functionName: 'totalAssets' }).catch(() => undefined),
			context.client.readContract({ abi: erc20Abi, address: vault, functionName: 'totalSupply' }).catch(() => undefined),
		]);
		if (totalAssets === undefined || totalSupply === undefined) continue;

		const row = {
			blockheight: event.block.number,
			totalAssets,
			totalSupply,
			price: totalSupply > 0n ? (totalAssets * 10n ** 18n) / totalSupply : 10n ** 18n,
		};

		await context.db
			.insert(ERC4626Daily)
			.values({ chainId, vault: normalizeAddress(vault), day, ...row })
			.onConflictDoUpdate(row);
	}
}
