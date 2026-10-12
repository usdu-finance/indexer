import { Event, type Context } from 'ponder:registry';
import { ModuleRevenueV1Daily, ModuleRevenueV1Revenue } from 'ponder:schema';
import { Address } from 'viem';
import { ModuleRevenueV1_ABI } from '@usdu-finance/usdu-core';
import { normalizeAddress, timestampStartOfDay } from '../utils/format';

export async function indexModuleRevenueV1Revenue(event: Event<'ModuleRevenueV1:Revenue'>, context: Context<'ModuleRevenueV1:Revenue'>) {
	await context.db.insert(ModuleRevenueV1Revenue).values({
		chainId: context.chain.id,
		module: normalizeAddress(event.log.address),
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		created: event.block.timestamp,
		blockheight: event.block.number,
		amount: event.args.amount,
		totalRevenue: event.args.totalRevenue,
		totalMinted: event.args.totalMinted,
	});
}

export async function indexModuleRevenueV1Daily(
	event: Event<'ModuleRevenueV1Daily:block'>,
	context: Context<'ModuleRevenueV1Daily:block'>,
	modules: Address[]
) {
	const chainId = context.chain.id;
	const day = BigInt(timestampStartOfDay(Number(event.block.timestamp)));

	for (const module of modules) {
		// skip modules that are not deployed yet at this block
		const code = await context.client.getCode({ address: module });
		if (!code || code === '0x') continue;

		const [totalMinted, totalRevenue] = await Promise.all([
			context.client.readContract({ abi: ModuleRevenueV1_ABI, address: module, functionName: 'totalMinted' }),
			context.client.readContract({ abi: ModuleRevenueV1_ABI, address: module, functionName: 'totalRevenue' }),
		]);

		const row = { blockheight: event.block.number, totalMinted, totalRevenue };

		await context.db
			.insert(ModuleRevenueV1Daily)
			.values({ chainId, module: normalizeAddress(module), day, ...row })
			.onConflictDoUpdate(row);
	}
}
