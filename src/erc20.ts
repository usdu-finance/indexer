import { ponder } from 'ponder:registry';
import { indexERC20Balance } from './lib/ERC20Balance';
import { indexERC20MintBurn } from './lib/ERC20MintBurn';

ponder.on('ERC20:Transfer', async ({ event, context }) => {
	await indexERC20MintBurn(event, context);
	await indexERC20Balance(event, context, {});
});
