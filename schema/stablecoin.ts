import { onchainTable, primaryKey } from 'ponder';

export const StablecoinSubmitModule = onchainTable(
	'StablecoinSubmitModule',
	(t) => ({
		chainId: t.integer().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),
		caller: t.hex().notNull(),
		newModule: t.hex().notNull(),
		expiredAt: t.bigint().notNull(),
		message: t.text().notNull(),
		timelock: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
	})
);

export const StablecoinRevokePendingModule = onchainTable(
	'StablecoinRevokePendingModule',
	(t) => ({
		chainId: t.integer().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),
		caller: t.hex().notNull(),
		module: t.hex().notNull(),
		message: t.text().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
	})
);

export const StablecoinSetModule = onchainTable(
	'StablecoinSetModule',
	(t) => ({
		chainId: t.integer().notNull(),
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),
		caller: t.hex().notNull(),
		newModule: t.hex().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.txHash, table.logIndex] }),
	})
);