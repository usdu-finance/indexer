import { onchainTable, primaryKey } from 'ponder';

export const StreamerVaultV1Synced = onchainTable(
	'StreamerVaultV1Synced',
	(t) => ({
		chainId: t.integer().notNull(),
		vault: t.hex().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),

		amount: t.bigint().notNull(), // newly streamed rewards
		locked: t.bigint().notNull(), // locked after merging with the remaining stream
		streamEnd: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.vault, table.blockheight, table.logIndex] }),
	})
);
