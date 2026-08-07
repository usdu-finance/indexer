import { Address } from 'viem';

export const formatCurrency = (value: string | number, minimumFractionDigits = 0, maximumFractionDigits = 2) => {
	const amount = typeof value === 'string' ? parseFloat(value) : value;

	if (amount === null || !!isNaN(amount)) return null;

	if (amount < 0.01 && amount > 0 && maximumFractionDigits) {
		return '< 0.01';
	}

	const formatter = new Intl.NumberFormat('en-US', {
		maximumFractionDigits,
		minimumFractionDigits,
	});

	return formatter.format(amount).split(',').join(`'`);
};

export function formatFloat(value: bigint, digits: number = 18) {
	return parseInt(value.toString()) / 10 ** digits;
}

export function normalizeAddress(addr: string): Address {
	return addr.toLowerCase() as Address;
}

export function timestampToSeconds(ms: number | string) {
	return String(Math.floor(Number(ms) / 1000));
}

export function timestampStartOfDay(seconds: number | string) {
	return String(Number(seconds) - (Number(seconds) % 86_400));
}
