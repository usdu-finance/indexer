import type { Context } from 'ponder:registry';
import { timestampStartOfDay } from '../utils/format';

/**
 * Blocks between two ticks of a daily snapshot handler (~1 hour at 12s blocks). It is not the snapshot period: a tick
 * only decides when the indexer looks at the clock, the snapshots themselves are aligned to utc midnight.
 */
export const DAILY_TICK_BLOCKS = 300n;

const DAY = 86_400;
// ticks of blocks older than this are history: their days are finalized at midnight, so no live row is written for them
const LIVE_WINDOW = 3 * DAY;

export interface SnapshotTarget {
	/** utc midnight of the day the snapshot belongs to, seconds */
	day: bigint;
	/** block to read the state at */
	blockNumber: bigint;
}

/**
 * Where to read state for the daily snapshot tables, so that the row of a day is the state at the END of that utc day
 * (daily revenue is the difference between two rows, so a row taken at another time of day would book revenue on the
 * wrong day).
 *
 * - On every recent tick, today's row is refreshed (live, the latest tick of a day wins).
 * - On the first tick after utc midnight, yesterday's row is pinned to the last block before midnight, replacing the
 *   value of the last tick of that day.
 */
export async function snapshotTargets(
	block: { number: bigint; timestamp: bigint },
	context: Context<any>
): Promise<SnapshotTarget[]> {
	const today = BigInt(timestampStartOfDay(Number(block.timestamp)));
	const targets: SnapshotTarget[] = [];

	if (Math.floor(Date.now() / 1000) - Number(block.timestamp) < LIVE_WINDOW) {
		targets.push({ day: today, blockNumber: block.number });
	}

	// first tick of the day: the previous tick was still on the day before
	const previous = await context.client.getBlock({ blockNumber: block.number - DAILY_TICK_BLOCKS });
	if (previous.timestamp < today) {
		targets.push({ day: today - BigInt(DAY), blockNumber: await lastBlockBefore(today, previous.number, block.number, context) });
	}

	return targets;
}

/** The last block with a timestamp before `time`, between `low` (before it) and `high` (at or after it) */
async function lastBlockBefore(time: bigint, low: bigint, high: bigint, context: Context<any>) {
	while (high - low > 1n) {
		const mid = (low + high) / 2n;
		const { timestamp } = await context.client.getBlock({ blockNumber: mid });
		if (timestamp < time) low = mid;
		else high = mid;
	}
	return low;
}
