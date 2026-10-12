# indexer

Event indexer and data aggregation service for the stablecoin liquidity layer, tracking on-chain smart contract events and protocol interactions across integrated adapters. Built with [Ponder](https://ponder.sh).

## Structure

```
ponder.config.ts       chains, contracts (address arrays), block intervals
ponder.schema.ts       re-exports all tables from schema/
schema/                onchain tables, one file per domain
src/
  <domain>.ts          event handlers (ponder.on), thin
  lib/                 indexing logic called by the handlers
  utils/format.ts      shared helpers
  api/index.ts         GraphQL and SQL endpoints
```

| Domain               | Schema                         | Handlers                    | Indexes                                                                     |
| -------------------- | ------------------------------ | --------------------------- | --------------------------------------------------------------------------- |
| `stablecoin`         | `schema/stablecoin.ts`         | `src/stablecoin.ts`         | module proposals and mappings                                               |
| `erc20`              | `schema/erc20.ts`              | `src/erc20.ts`              | mint/burn, supply, balances per account (stablecoins and vault shares)      |
| `erc4626`            | `schema/erc4626.ts`            | `src/erc4626.ts`            | deposit/withdraw history, positions (cost basis), daily snapshots           |
| `streamerVaultV1`    | `schema/streamerVaultV1.ts`    | `src/streamerVaultV1.ts`    | `Synced` events (reward streams)                                            |
| `moduleRevenueV1`    | `schema/moduleRevenueV1.ts`    | `src/moduleRevenueV1.ts`    | `Revenue` events, daily `totalMinted` / `totalRevenue` snapshots per module |
| `swapBridgeMorphoV1` | `schema/swapBridgeMorphoV1.ts` | `src/swapBridgeMorphoV1.ts` | `SwapIn` / `SwapOut` history, daily volume and fees per module              |

## Conventions

-   Handlers stay thin; logic lives in `src/lib/`.
-   Always use the helpers from `src/utils/format.ts`, e.g. `normalizeAddress()` for addresses and `timestampStartOfDay()` for daily keys. Never call `.toLowerCase()` directly.
-   Addresses come from `ADDRESS` and ABIs from `@usdu-finance/usdu-core`.
-   Contract address arrays are listed inline in `ponder.config.ts`. To index another ERC4626 vault, add it to the `ERC4626` entry (and to `ERC20` for share balances).

## Scripts

```
yarn dev         # ponder dev
yarn start       # ponder start
yarn codegen     # regenerate ponder-env.d.ts
yarn typecheck
yarn lint
```

Requires `ALCHEMY_RPC_KEY` in the environment.
