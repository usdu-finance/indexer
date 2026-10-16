import { Hono } from 'hono';
import { GodEyeService, HttpError } from './godeye.service';

const num = (v?: string) => (v === undefined || v === '' || isNaN(Number(v)) ? undefined : Number(v));

/** GodEye: ERC20 fund-flow analytics, mounted at /godeye */
export const godeye = new Hono();
const service = new GodEyeService();

godeye.onError((err, c) => {
	if (err instanceof HttpError) return c.json({ statusCode: err.status, message: err.message }, err.status);
	console.error('[godeye]', err);
	return c.json({ statusCode: 500, message: 'Internal server error' }, 500);
});

// wait for the first ledger load, later requests refresh in the background when stale
godeye.use('*', async (_c, next) => {
	await service.ready();
	await next();
});

godeye.get('/tokens', (c) => c.json(service.getTokens()));

godeye.get('/addressbook', (c) => c.json(service.getAddressBook(num(c.req.query('chainId')))));

godeye.get('/timeline', (c) => c.json(service.getTimeline(c.req.query('token'), num(c.req.query('chainId')))));

godeye.get('/graph', (c) => {
	const q = c.req.query();
	return c.json(
		service.getGraph({
			token: q.token,
			chainId: num(q.chainId),
			at: num(q.at),
			window: num(q.window),
			top: num(q.top),
			rank: q.rank as 'balance' | 'volume' | undefined,
			mode: q.mode as 'entities' | 'categories' | undefined,
			focus: q.focus,
			minAmount: num(q.minAmount),
		})
	);
});

godeye.get('/holders', (c) => {
	const q = c.req.query();
	return c.json(service.getHolders(q.token, num(q.chainId), num(q.at), Math.min(num(q.limit) || 100, 500), num(q.offset) || 0));
});

godeye.get('/search', (c) => {
	const q = c.req.query();
	return c.json(service.search(q.q || '', q.token, num(q.chainId)));
});

godeye.get('/address/:address', async (c) => {
	const q = c.req.query();
	return c.json(await service.getAddress(c.req.param('address'), q.token, num(q.chainId)));
});

godeye.get('/address/:address/transfers', async (c) => {
	const q = c.req.query();
	return c.json(await service.getTransfers(c.req.param('address'), q.token, num(q.chainId), num(q.from), num(q.to), q.peer));
});

godeye.get('/address/:address/journey', (c) => {
	const q = c.req.query();
	return c.json(service.getJourney(c.req.param('address'), q.token, num(q.chainId)));
});
