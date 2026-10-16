import { ponder } from 'ponder:registry';
import { eq, desc, and } from 'ponder';
import { StablecoinModuleHistory, StablecoinModuleMapping } from '../schema/stablecoin';
import { Address, maxUint256 } from 'viem';
import { normalizeAddress } from './utils/format';

/** friendly names of known modules, applied to every module message we store */
const setMessageOverwrite = (module: Address, message: string) => {
	module = normalizeAddress(module);

	if (module == normalizeAddress('0x6d6525d8e234d840b2699f7107f14fa0d6c62c42')) {
		return 'Morpho Core Vault - V1';
	} else if (module == normalizeAddress('0x6f05782a28cda7f01b054b014cf6cd92023937e4')) {
		return 'Curve USDC Pool - V1';
	} else if (module == normalizeAddress('0xab6523cd7fa669ec35bd5358df505382b810cdb5')) {
		return 'Morpho Core Vault - V1.1';
	} else if (module == normalizeAddress('0x77ebb1d7a7f5371a61b7d21d7734b6dde6f0f94f')) {
		return 'Curve USDC Pool - V1.1';
	} else if (module == normalizeAddress('0xfb46481a9819e068af0eb64a2c2824fcecaaaa45')) {
		return 'Morpho Core Vault - V1.2';
	} else if (module == normalizeAddress('0x8f36bbee57acb4857cb97898020b529969fdf221')) {
		return 'TermMax Core Vault - RecoveryV1';
	} else if (module == normalizeAddress('0x77cbb2f180f55dd2916bfc78f879a2c2de37f638')) {
		return 'Curve USDC Pool - V1.1';
	} else if (module == normalizeAddress('0x397fb4a34757ac180c0841b26131f25040e2e50b')) {
		return 'TermMax RWA Vault - RecoveryV1';
	} else if (module == normalizeAddress('0x5febefd5aecfefb3352c5edd49d634b1456c4bd7')) {
		return 'TermMax Yield Vault - RecoveryV1';
	} else if (module == normalizeAddress('0x6b6893d82edbC8d6769ba3c407102D33dA2B623f')) {
		return 'Swap Bridge V1 - steakUSDC';
	} else if (module == normalizeAddress('0xd9141f634Ef9E871A5FE4f64195747DB77A13f3E')) {
		return 'Swap Bridge V1 - steakUSDT';
	} else if (module == normalizeAddress('0x83F263eF950586Ce3C35D58930f0d2001fe79c50')) {
		return 'Swap Bridge V1 - steakEURC';
	} else if (module == normalizeAddress('0xA39665F17592c69B6876CE70FdD12c1890D3ae36')) {
		return 'Swap Bridge V1 - svDEURO';
	} else if (module == normalizeAddress('0x19ff1079d9CdA8E415af4C95cFEb5A2f47Da1d15')) {
		return 'Swap Bridge V1 - svZCHF';
	} else {
		return message;
	}
};

ponder.on('Stablecoin:SubmitModule', async ({ event, context }) => {
	await context.db.insert(StablecoinModuleHistory).values({
		chainId: context.chain.id,
		stablecoin: normalizeAddress(event.log.address),
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		createdAt: BigInt(event.block.timestamp),
		blockheight: BigInt(event.block.number),
		caller: event.args.caller,
		module: event.args.newModule,

		kind: 'Proposed',
		message: setMessageOverwrite(event.args.newModule, event.args.message),

		expiredAt: event.args.expiredAt,
		timelock: event.args.timelock,
	});
});

ponder.on('Stablecoin:RevokePendingModule', async ({ event, context }) => {
	await context.db.insert(StablecoinModuleHistory).values({
		chainId: context.chain.id,
		stablecoin: normalizeAddress(event.log.address),
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		createdAt: BigInt(event.block.timestamp),
		blockheight: BigInt(event.block.number),
		caller: event.args.caller,
		module: event.args.module,

		kind: 'Revoked',
		message: setMessageOverwrite(event.args.module, event.args.message),
	});
});

ponder.on('Stablecoin:SetModule', async ({ event, context }) => {
	const stablecoin = normalizeAddress(event.log.address);

	// Look up the corresponding SubmitModule proposal to get full details
	const proposals = await context.db.sql
		.select()
		.from(StablecoinModuleHistory)
		.where(
			and(
				eq(StablecoinModuleHistory.chainId, context.chain.id),
				eq(StablecoinModuleHistory.stablecoin, stablecoin),
				eq(StablecoinModuleHistory.module, event.args.newModule),
				eq(StablecoinModuleHistory.kind, 'Proposed')
			)
		)
		.orderBy(desc(StablecoinModuleHistory.createdAt))
		.limit(1);

	await context.db.insert(StablecoinModuleHistory).values({
		chainId: context.chain.id,
		stablecoin,
		txHash: event.transaction.hash,
		logIndex: event.log.logIndex,
		createdAt: BigInt(event.block.timestamp),
		blockheight: BigInt(event.block.number),
		caller: event.args.caller,
		module: event.args.newModule,

		kind: 'Set',
		message: 'Proposed changes applied',
	});

	if (proposals.length === 0) {
		// native module approved during stablecoin deployment
		await context.db.insert(StablecoinModuleMapping).values({
			chainId: context.chain.id,
			stablecoin,
			txHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			createdAt: BigInt(event.block.timestamp),
			blockheight: BigInt(event.block.number),
			caller: event.args.caller,
			module: event.args.newModule,
			message: setMessageOverwrite(event.args.newModule, ''),

			expiredAt: maxUint256,
			updatedAt: BigInt(event.block.timestamp),
		});
	} else {
		// all other modules
		const proposal = proposals[0];
		await context.db
			.insert(StablecoinModuleMapping)
			.values({
				chainId: context.chain.id,
				stablecoin,
				txHash: event.transaction.hash,
				logIndex: event.log.logIndex,
				createdAt: BigInt(event.block.timestamp),
				blockheight: BigInt(event.block.number),
				caller: event.args.caller,
				module: event.args.newModule,
				message: setMessageOverwrite(event.args.newModule, proposal!.message),

				expiredAt: proposal?.expiredAt || 0n,
				updatedAt: BigInt(event.block.timestamp),
			})
			.onConflictDoUpdate((current) => ({
				txHash: event.transaction.hash,
				logIndex: event.log.logIndex,
				blockheight: BigInt(event.block.number),
				caller: event.args.caller,
				messageUpdated: setMessageOverwrite(event.args.newModule, proposal!.message),

				expiredAt: proposal?.expiredAt || 0n,
				updatedAt: BigInt(event.block.timestamp),
			}));
	}
});
