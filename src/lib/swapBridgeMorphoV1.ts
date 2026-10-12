import { Event, type Context } from 'ponder:registry';
import { SwapBridgeMorphoV1Daily, SwapBridgeMorphoV1Swap } from 'ponder:schema';
import { normalizeAddress, timestampStartOfDay } from '../utils/format';

export async function indexSwapBridgeMorphoV1SwapIn(
	event: Event<'SwapBridgeMorphoV1:SwapIn'>,
	context: Context<'SwapBridgeMorphoV1:SwapIn'>
) {
	const { target, amountCoin, amountStable, fee } = event.args;
	await index(event, context, 'SwapIn', target, amountCoin, amountStable, fee);
}

export async function indexSwapBridgeMorphoV1SwapOut(
	event: Event<'SwapBridgeMorphoV1:SwapOut'>,
	context: Context<'SwapBridgeMorphoV1:SwapOut'>
) {
	const { target, amountCoin, amountStable, fee } = event.args;
	await index(event, context, 'SwapOut', target, amountCoin, amountStable, fee);
}

async function index(
	event: Event<'SwapBridgeMorphoV1:SwapIn' | 'SwapBridgeMorphoV1:SwapOut'>,
	context: Context<'SwapBridgeMorphoV1:SwapIn'> | Context<'SwapBridgeMorphoV1:SwapOut'>,
	kind: 'SwapIn' | 'SwapOut',
	target: string,
	amountCoin: bigint,
	amountStable: bigint,
	fee: bigint
) {
	const chainId = context.chain.id;
	const module = normalizeAddress(event.log.address);
	const isIn = kind === 'SwapIn';

	await context.db.insert(SwapBridgeMorphoV1Swap).values({
		chainId,
		module,
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		created: event.block.timestamp,
		blockheight: event.block.number,
		kind,
		target: normalizeAddress(target),
		amountCoin,
		amountStable,
		fee,
	});

	await context.db
		.insert(SwapBridgeMorphoV1Daily)
		.values({
			chainId,
			module,
			day: BigInt(timestampStartOfDay(Number(event.block.timestamp))),
			count: 1n,
			volumeIn: isIn ? amountStable : 0n,
			volumeOut: isIn ? 0n : amountStable,
			fees: fee,
		})
		.onConflictDoUpdate((current) => ({
			count: current.count + 1n,
			volumeIn: current.volumeIn + (isIn ? amountStable : 0n),
			volumeOut: current.volumeOut + (isIn ? 0n : amountStable),
			fees: current.fees + fee,
		}));
}
