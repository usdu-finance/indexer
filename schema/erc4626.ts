import { onchainTable, primaryKey } from 'ponder';

// status

export const ERC4626Status = onchainTable(
	'ERC4626Status',
	(t) => ({
		chainId: t.integer().notNull(),
		vault: t.hex().notNull(),
		updated: t.bigint().notNull(),
		count: t.bigint().notNull(), // number of deposit/withdraw entries
		deposited: t.bigint().notNull(), // cumulative assets in
		withdrawn: t.bigint().notNull(), // cumulative assets out
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.vault] }),
	})
);

// deposit and withdraw history (mint -> deposit, redeem -> withdraw, same events)

export const ERC4626History = onchainTable(
	'ERC4626History',
	(t) => ({
		chainId: t.integer().notNull(),
		vault: t.hex().notNull(),
		count: t.bigint().notNull(),
		txHash: t.hex().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),

		kind: t.text().notNull(), // Deposit | Withdraw
		sender: t.hex().notNull(),
		owner: t.hex().notNull(), // share owner
		receiver: t.hex().notNull(), // equals owner on deposit
		assets: t.bigint().notNull(),
		shares: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.vault, table.count] }),
	})
);

// per account cost basis. share balances live in ERC20BalanceMapping (vault is indexed as ERC20 too).
// unrealized yield = convertToAssets(balance) - (deposited - withdrawn)

export const ERC4626Position = onchainTable(
	'ERC4626Position',
	(t) => ({
		chainId: t.integer().notNull(),
		vault: t.hex().notNull(),
		account: t.hex().notNull(),
		updated: t.bigint().notNull(),
		deposited: t.bigint().notNull(),
		withdrawn: t.bigint().notNull(),
		sharesMinted: t.bigint().notNull(),
		sharesBurned: t.bigint().notNull(),
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.vault, table.account] }),
	})
);

// daily snapshot, one row per vault and day (last snapshot of the day wins)

export const ERC4626Daily = onchainTable(
	'ERC4626Daily',
	(t) => ({
		chainId: t.integer().notNull(),
		vault: t.hex().notNull(),
		day: t.bigint().notNull(), // utc midnight, seconds
		blockheight: t.bigint().notNull(),
		totalAssets: t.bigint().notNull(),
		totalSupply: t.bigint().notNull(),
		price: t.bigint().notNull(), // assets per 1e18 shares
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.vault, table.day] }),
	})
);
