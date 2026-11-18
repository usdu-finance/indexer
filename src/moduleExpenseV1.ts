import { ponder } from 'ponder:registry';
import { ModuleExpenseV1Expense } from 'ponder:schema';
import { normalizeAddress } from './utils/format';

ponder.on('ModuleExpenseV1:Expense', async ({ event, context }) => {
	await context.db.insert(ModuleExpenseV1Expense).values({
		chainId: context.chain.id,
		module: normalizeAddress(event.log.address),
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		created: event.block.timestamp,
		blockheight: event.block.number,
		token: normalizeAddress(event.args.token),
		to: normalizeAddress(event.args.to),
		amount: event.args.amount,
		totalExpense: event.args.totalExpense,
		totalFunds: event.args.totalFunds,
	});
});
