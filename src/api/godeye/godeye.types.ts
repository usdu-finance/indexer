export type GodEyeKind =
	| 'mint'
	| 'wallet'
	| 'position'
	| 'minter'
	| 'savings'
	| 'equity'
	| 'bridge'
	| 'dex'
	| 'exchange'
	| 'contract'
	| 'others';

export type GodEyeTokenInfo = {
	key: string;
	chainId: number;
	chain: string;
	token: string;
	symbol: string;
	transfers: number;
	firstTs: number;
	lastTs: number;
	syncedAt: number;
};

export type GodEyeLabel = { label: string; kind: GodEyeKind };

export type GodEyeAddressBookEntry = { chainId: number; address: string; label: string; kind: GodEyeKind };

export type GodEyeNode = {
	id: string;
	label: string | null;
	kind: GodEyeKind;
	balance: number;
	share: number;
	inflow: number;
	outflow: number;
	txs: number;
	first: number;
	last: number;
};

export type GodEyeEdge = {
	s: string;
	t: string;
	amount: number;
	count: number;
	first: number;
	last: number;
	via?: boolean;
};

export type GodEyeKindStats = { kind: GodEyeKind; addresses: number; balance: number; inflow: number; outflow: number };

export type GodEyeGraph = {
	token: GodEyeTokenInfo;
	mode: 'entities' | 'categories';
	at: number;
	from: number;
	supply: number;
	holders: number;
	totalNodes: number;
	coverage: number;
	nodes: GodEyeNode[];
	edges: GodEyeEdge[];
	kinds: GodEyeKindStats[];
	focus?: string;
};

export type GodEyeTimelinePoint = { t: number; supply: number; holders: number; volume: number; minted: number; burned: number; transfers: number };

export type GodEyeHolder = { address: string; label: string | null; kind: GodEyeKind; balance: number; share: number; since: number };

export type GodEyeHolders = {
	at: number;
	supply: number;
	holders: number;
	top1: number;
	top10: number;
	top100: number;
	buckets: { label: string; holders: number; balance: number }[];
	total: number;
	list: GodEyeHolder[];
};

export type GodEyeAddress = {
	address: string;
	label: string | null;
	kind: GodEyeKind;
	token: GodEyeTokenInfo;
	balance: number;
	share: number;
	inflow: number;
	outflow: number;
	minted: number;
	burned: number;
	txs: number;
	first: number;
	last: number;
	history: { t: number; balance: number }[];
	sources: GodEyePeer[];
	destinations: GodEyePeer[];
	origin: GodEyeOrigin[];
	recent: { txHash: string; t: number; from: string; to: string; amount: number }[];
};

export type GodEyePeer = { address: string; label: string | null; kind: GodEyeKind; amount: number; count: number; last: number };

export type GodEyeOrigin = GodEyePeer & { via: GodEyePeer[] };

export type GodEyeJourneyPeer = { address: string; label: string | null; kind: GodEyeKind };

/** one day of activity of an address; `peers` are the biggest counterparties of that day (index into `GodEyeJourney.peers`) */
export type GodEyeJourneyDay = {
	t: number;
	in: number;
	out: number;
	txs: number;
	balance: number;
	peers: { i: number; in: number; out: number; count: number }[];
};

export type GodEyeJourney = {
	address: string;
	label: string | null;
	kind: GodEyeKind;
	token: GodEyeTokenInfo;
	peers: GodEyeJourneyPeer[];
	days: GodEyeJourneyDay[];
};

export type GodEyeTransfer = {
	txHash: string;
	t: number;
	from: string;
	to: string;
	amount: number;
	/** the other side of the transfer, seen from the requested address */
	peer: { address: string; label: string | null; kind: GodEyeKind };
};
export type GodEyeTransfers = {
	address: string;
	token: GodEyeTokenInfo;
	from: number;
	to: number;
	/** false when a peer filter was requested but nothing matched (e.g. mints routed through a position), the list then holds all transfers of the window */
	peerMatched: boolean;
	/** true when the list was cut at the limit */
	more: boolean;
	transfers: GodEyeTransfer[];
};
