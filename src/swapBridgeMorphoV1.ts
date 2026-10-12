import { ponder } from 'ponder:registry';
import { indexSwapBridgeMorphoV1SwapIn, indexSwapBridgeMorphoV1SwapOut } from './lib/swapBridgeMorphoV1';

ponder.on('SwapBridgeMorphoV1:SwapIn', async ({ event, context }) => {
	await indexSwapBridgeMorphoV1SwapIn(event, context);
});

ponder.on('SwapBridgeMorphoV1:SwapOut', async ({ event, context }) => {
	await indexSwapBridgeMorphoV1SwapOut(event, context);
});
