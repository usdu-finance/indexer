import { onchainTable, primaryKey } from 'ponder';

// revenue minted to the curator when a module reconciles surplus from its strategy

export const ModuleRevenueV1Revenue = onchainTable(
	'ModuleRevenueV1Revenue',
	(t) => ({
		chainId: t.integer().notNull(),
		module: t.hex().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),

		amount: t.bigint().notNull(), // revenue of this reconcile
		totalRevenue: t.bigint().notNull(), // cumulative, after this event
		totalMinted: t.bigint().notNull(), // cumulative, after this event
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.module, table.blockheight, table.logIndex] }),
	})
);

// daily snapshot, one row per module and day (last snapshot of the day wins)

export const ModuleRevenueV1Daily = onchainTable(
	'ModuleRevenueV1Daily',
	(t) => ({
		chainId: t.integer().notNull(),
		module: t.hex().notNull(),
		day: t.bigint().notNull(), // utc midnight, seconds
		blockheight: t.bigint().notNull(),
		totalMinted: t.bigint().notNull(),
		totalRevenue: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.module, table.day] }),
	})
);
