import { onchainTable, primaryKey } from 'ponder';

// every expense paid by an expense-side contract (e.g. StreamerDepositorV1 funding a reward vault), generalized
// counterpart of ModuleRevenueV1Revenue. totalExpense and totalFunds are per token, never summed across tokens

export const ModuleExpenseV1Expense = onchainTable(
	'ModuleExpenseV1Expense',
	(t) => ({
		chainId: t.integer().notNull(),
		module: t.hex().notNull(), // the contract that paid
		txHash: t.hex().notNull(),
		logIndex: t.integer().notNull(),
		created: t.bigint().notNull(),
		blockheight: t.bigint().notNull(),

		token: t.hex().notNull(), // token paid out
		to: t.hex().notNull(), // recipient (e.g. a reward vault)
		amount: t.bigint().notNull(), // expense of this event
		totalExpense: t.bigint().notNull(), // cumulative in `token`, after this event
		totalFunds: t.bigint().notNull(), // funds still backing future expenses in `token`, after this event
	}),
	(table) => ({
		pk: primaryKey({ columns: [table.chainId, table.module, table.blockheight, table.logIndex] }),
	})
);
