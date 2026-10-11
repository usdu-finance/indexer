import { ponder } from 'ponder:registry';
import { StreamerVaultV1Synced } from 'ponder:schema';
import { normalizeAddress } from './utils/format';

ponder.on('StreamerVaultV1:Synced', async ({ event, context }) => {
	await context.db.insert(StreamerVaultV1Synced).values({
		chainId: context.chain.id,
		vault: normalizeAddress(event.log.address),
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		created: event.block.timestamp,
		blockheight: event.block.number,
		amount: event.args.amount,
		locked: event.args.locked,
		streamEnd: BigInt(event.args.streamEnd),
	});
});
