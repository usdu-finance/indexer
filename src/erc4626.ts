import { ponder } from 'ponder:registry';
import { Address } from 'viem';
import config from '../ponder.config';
import { indexERC4626Daily, indexERC4626Deposit, indexERC4626Withdraw } from './lib/erc4626';

ponder.on('ERC4626:Deposit', async ({ event, context }) => {
	await indexERC4626Deposit(event, context);
});

ponder.on('ERC4626:Withdraw', async ({ event, context }) => {
	await indexERC4626Withdraw(event, context);
});

ponder.on('ERC4626Daily:block', async ({ event, context }) => {
	await indexERC4626Daily(event, context, config.contracts.ERC4626.chain.Ethereum.address as Address[]);
});
