import { ponder } from 'ponder:registry';
import { indexERC20Balance } from './lib/erc20Balance';
import { indexERC20MintBurn } from './lib/erc20MintBurn';

ponder.on('ERC20:Transfer', async ({ event, context }) => {
	await indexERC20MintBurn(event, context);
	await indexERC20Balance(event, context, {});
});
