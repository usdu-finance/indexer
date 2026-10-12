import { onchainTable, primaryKey } from 'ponder';

// swap history

export const SwapBridgeMorphoV1Swap = onchainTable(
	'SwapBridgeMorphoV1Swap',
	(t) => ({
		chainId: t.integer().notNull(),
		module: t.hex().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),

		kind: t.text().notNull(), // SwapIn | SwapOut
		target: t.hex().notNull(), // receiver of the swap
		amountCoin: t.bigint().notNull(), // backing coin, in coin decimals
		amountStable: t.bigint().notNull(), // stablecoin, 18 decimals, before fee
		fee: t.bigint().notNull(), // stablecoin, 18 decimals
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.module, table.blockheight, table.logIndex] }),
	})
);

// daily flat aggregate, one row per module and day with swaps (all amounts in stablecoin, 18 decimals)

export const SwapBridgeMorphoV1Daily = onchainTable(
	'SwapBridgeMorphoV1Daily',
	(t) => ({
		chainId: t.integer().notNull(),
		module: t.hex().notNull(),
		day: t.bigint().notNull(), // utc midnight, seconds
		count: t.bigint().notNull(), // number of swaps
		volumeIn: t.bigint().notNull(),
		volumeOut: t.bigint().notNull(),
		fees: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.module, table.day] }),
	})
);
