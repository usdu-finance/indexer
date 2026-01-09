import { createConfig } from 'ponder';
import {
	arbitrum,
	avalanche,
	base,
	gnosis,
	mainnet,
	optimism,
	polygon,
	sonic,
} from 'viem/chains';
import { Chain, createPublicClient, erc20Abi, http } from 'viem';
import { ADDRESS, Stablecoin_ABI } from '@usdu-finance/usdu-core';

export const config = {
	// core deployment
	[mainnet.id]: {
		rpc: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),

		// block numbers
		startUsdu: 22843900,
	},

	// multichain support
	[polygon.id]: {
		rpc: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
	[arbitrum.id]: {
		rpc: `https://arb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
	[optimism.id]: {
		rpc: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
	[base.id]: {
		rpc: `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
	[avalanche.id]: {
		rpc: `https://avax-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
	[gnosis.id]: {
		rpc: `https://gnosis-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
	[sonic.id]: {
		rpc: `https://sonic-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_RPC_KEY}`,
		maxRequestsPerSecond: parseInt(
			process.env.MAX_REQUESTS_PER_SECOND || '50'
		),
		pollingInterval: parseInt(process.env.POLLING_INTERVAL_MS || '5000'),
	},
};

export function getPublicClient(chain: Chain) {
	const chainConfig = config[chain.id as keyof typeof config];
	if (!chainConfig) {
		throw new Error(`Chain ${chain.id} not supported`);
	}
	return createPublicClient({
		chain,
		transport: http(chainConfig.rpc),
	});
}

export default createConfig({
	chains: {
		// ### NATIVE CHAIN SUPPORT ###
		[mainnet.name]: {
			id: mainnet.id,
			maxRequestsPerSecond: config[mainnet.id].maxRequestsPerSecond,
			pollingInterval: config[mainnet.id].pollingInterval,
			rpc: http(config[mainnet.id].rpc),
		},

		// ### MULTI CHAIN SUPPORT ###
		/*
		[polygon.name]: {
			id: polygon.id,
			maxRequestsPerSecond: config[polygon.id].maxRequestsPerSecond,
			pollingInterval: config[polygon.id].pollingInterval,
			rpc: http(config[polygon.id].rpc),
		},
		[arbitrum.name]: {
			id: arbitrum.id,
			maxRequestsPerSecond: config[arbitrum.id].maxRequestsPerSecond,
			pollingInterval: config[arbitrum.id].pollingInterval,
			rpc: http(config[arbitrum.id].rpc),
		},
		[optimism.name]: {
			id: optimism.id,
			maxRequestsPerSecond: config[optimism.id].maxRequestsPerSecond,
			pollingInterval: config[optimism.id].pollingInterval,
			rpc: http(config[optimism.id].rpc),
		},
		[base.name]: {
			id: base.id,
			maxRequestsPerSecond: config[base.id].maxRequestsPerSecond,
			pollingInterval: config[base.id].pollingInterval,
			rpc: http(config[base.id].rpc),
		},
		[avalanche.name]: {
			id: avalanche.id,
			maxRequestsPerSecond: config[avalanche.id].maxRequestsPerSecond,
			pollingInterval: config[avalanche.id].pollingInterval,
			rpc: http(config[avalanche.id].rpc),
		},
		[gnosis.name]: {
			id: gnosis.id,
			maxRequestsPerSecond: config[gnosis.id].maxRequestsPerSecond,
			pollingInterval: config[gnosis.id].pollingInterval,
			rpc: http(config[gnosis.id].rpc),
		},
		[sonic.name]: {
			id: sonic.id,
			maxRequestsPerSecond: config[sonic.id].maxRequestsPerSecond,
			pollingInterval: config[sonic.id].pollingInterval,
			rpc: http(config[sonic.id].rpc),
		}, */
	},
	contracts: {
		// ### NATIVE CONTRACT ###
		Stablecoin: {
			abi: Stablecoin_ABI,
			chain: {
				[mainnet.name]: {
					address: ADDRESS[mainnet.id].usduStable,
					startBlock: config[mainnet.id].startUsdu,
				},
			},
		},
		// AragonMultiSig: {
		// 	chain: mainnet.name,
		// 	abi: Stablecoin_ABI,
		// 	address: ADDRESS[mainnet.id].usdc,
		// 	startBlock: config[mainnet.id].startUsdu,
		// },

		// ### COMMON CONTRACTS ###
		ERC20: {
			abi: erc20Abi,
			chain: {
				[mainnet.name]: {
					address: [ADDRESS[mainnet.id].usduStable],
					startBlock: config[mainnet.id].startUsdu,
				},
			},
		},
	},
});
