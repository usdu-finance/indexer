import { ponder } from 'ponder:registry';
import {
	StablecoinSubmitModule,
	StablecoinRevokePendingModule,
	StablecoinSetModule,
} from '../schema/stablecoin';

ponder.on('Stablecoin:SubmitModule', async ({ event, context }) => {
	await context.db
		.insert(StablecoinSubmitModule)
		.values({
			chainId: context.chain.id,
			txHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			created: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			newModule: event.args.newModule,
			expiredAt: event.args.expiredAt,
			message: event.args.message,
			timelock: event.args.timelock,
		})
		.onConflictDoUpdate((current) => ({
			created: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			newModule: event.args.newModule,
			expiredAt: event.args.expiredAt,
			message: event.args.message,
			timelock: event.args.timelock,
		}));
});

ponder.on('Stablecoin:RevokePendingModule', async ({ event, context }) => {
	await context.db
		.insert(StablecoinRevokePendingModule)
		.values({
			chainId: context.chain.id,
			txHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			created: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			module: event.args.module,
			message: event.args.message,
		})
		.onConflictDoUpdate((current) => ({
			created: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			module: event.args.module,
			message: event.args.message,
		}));
});

ponder.on('Stablecoin:SetModule', async ({ event, context }) => {
	await context.db
		.insert(StablecoinSetModule)
		.values({
			chainId: context.chain.id,
			txHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			created: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			newModule: event.args.newModule,
		})
		.onConflictDoUpdate((current) => ({
			created: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			newModule: event.args.newModule,
		}));
});
