import { onchainTable, primaryKey } from 'ponder';

export const StablecoinModuleHistory = onchainTable(
	'StablecoinModuleHistory',
	(t) => ({
		chainId: t.integer().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		createdAt: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),
		caller: t.hex().notNull(),
		module: t.hex().notNull(),

		// states: [Proposed, Revoked, Set]
		kind: t.text().notNull(),

		// additional metadata
		message: t.text().notNull(),
		expiredAt: t.bigint(),
		timelock: t.bigint(),
	}),
	(table) => ({
		pk: primaryKey({
			columns: [
				table.chainId,
				table.module,
				table.blockheight,
				table.logIndex,
			],
		}),
	}),
);

export const StablecoinModuleMapping = onchainTable(
	'StablecoinModuleMapping',
	(t) => ({
		chainId: t.integer().notNull(),
		createdAt: t.bigint().notNull(),
		module: t.hex().notNull(),
		message: t.text().notNull(),

		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		blockheight: t.bigint().notNull(),
		caller: t.hex().notNull(),
		messageUpdated: t.text(),

		expiredAt: t.bigint().notNull(),
		updatedAt: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.module] }),
	}),
);
