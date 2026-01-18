import { ponder } from 'ponder:registry';
import { eq, desc, and } from 'ponder';
import {
	StablecoinModuleHistory,
	StablecoinModuleMapping,
} from '../schema/stablecoin';
import { maxUint256 } from 'viem';

ponder.on('Stablecoin:SubmitModule', async ({ event, context }) => {
	await context.db.insert(StablecoinModuleHistory).values({
		chainId: context.chain.id,
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		createdAt: BigInt(event.block.timestamp),
		blockheight: BigInt(event.block.number),
		caller: event.args.caller,
		module: event.args.newModule,

		kind: 'Proposed',
		message: event.args.message,

		expiredAt: event.args.expiredAt,
		timelock: event.args.timelock,
	});
});

ponder.on('Stablecoin:RevokePendingModule', async ({ event, context }) => {
	await context.db.insert(StablecoinModuleHistory).values({
		chainId: context.chain.id,
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		createdAt: BigInt(event.block.timestamp),
		blockheight: BigInt(event.block.number),
		caller: event.args.caller,
		module: event.args.module,

		kind: 'Revoked',
		message: event.args.message,
	});
});

ponder.on('Stablecoin:SetModule', async ({ event, context }) => {
	// Look up the corresponding SubmitModule proposal to get full details
	const proposals = await context.db.sql
		.select()
		.from(StablecoinModuleHistory)
		.where(
			and(
				eq(StablecoinModuleHistory.chainId, context.chain.id),
				eq(StablecoinModuleHistory.module, event.args.newModule),
				eq(StablecoinModuleHistory.kind, 'Proposed'),
			),
		)
		.orderBy(desc(StablecoinModuleHistory.createdAt))
		.limit(1);

	await context.db.insert(StablecoinModuleHistory).values({
		chainId: context.chain.id,
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		createdAt: BigInt(event.block.timestamp),
		blockheight: BigInt(event.block.number),
		caller: event.args.caller,
		module: event.args.newModule,

		kind: 'Set',
		message: 'Module changes approved',
	});

	if (proposals.length === 0) {
		// native module approved during stablecoin deployment
		await context.db.insert(StablecoinModuleMapping).values({
			chainId: context.chain.id,
			txHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			createdAt: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			module: event.args.newModule,
			message: 'MorphoAdapterV1',

			expiredAt: maxUint256,
			updatedAt: BigInt(event.block.timestamp),
		});
	} else {
		// all other modules
		const proposal = proposals[0];
		await context.db
			.insert(StablecoinModuleMapping)
			.values({
				chainId: context.chain.id,
				txHash: event.transaction.hash,
				logIndex: event.log.logIndex,
				createdAt: BigInt(event.block.timestamp),
				blockheight: BigInt(event.block.number),
				caller: event.args.caller,
				module: event.args.newModule,
				message: proposal!.message,

				expiredAt: proposal?.expiredAt || 0n,
				updatedAt: BigInt(event.block.timestamp),
			})
			.onConflictDoUpdate((current) => ({
				txHash: event.transaction.hash,
				logIndex: event.log.logIndex,
				blockheight: BigInt(event.block.number),
				caller: event.args.caller,
				messageUpdated: proposal!.message,

				expiredAt: proposal?.expiredAt || 0n,
				updatedAt: BigInt(event.block.timestamp),
			}));
	}
});
