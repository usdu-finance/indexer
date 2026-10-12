import { ponder } from 'ponder:registry';
import { Address } from 'viem';
import config from '../ponder.config';
import { indexModuleRevenueV1Daily, indexModuleRevenueV1Revenue } from './lib/moduleRevenueV1';

ponder.on('ModuleRevenueV1:Revenue', async ({ event, context }) => {
	await indexModuleRevenueV1Revenue(event, context);
});

ponder.on('ModuleRevenueV1Daily:block', async ({ event, context }) => {
	await indexModuleRevenueV1Daily(event, context, config.contracts.ModuleRevenueV1.chain.Ethereum.address as Address[]);
});
