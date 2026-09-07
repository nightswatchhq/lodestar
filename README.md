# Lodestar 🌟
_Stay oriented_

> **Part of the Perimeter at [Edge & Edge](https://edgeandedgeandedge.com).** Voluntarily incorporated; see the [official statement](https://edgeandedgeandedge.com/blog/lodestar). This was not a hostile takeover. No electricity was threatened — in part or as a whole.

![Screen Recording 2026-03-20 at 13 49 40](https://github.com/user-attachments/assets/62f58f1f-55f4-4d32-a8df-8ee3f1c9632e)

Analytics dashboard for The Graph Protocol on Arbitrum One. Real-time network metrics, indexer intelligence, delegation tools, portfolio tracking, curation management, and subgraph developer tooling.

**Live:** [lodestar-dashboard.com](https://lodestar-dashboard.com)

## Features

- **Protocol Overview** — Total stake, delegation, signalling, total supply, estimated annual issuance, epoch progress, a per-epoch fees/rewards table with derived status (Active/Settling/Distributing/Finalized), rewards-per-epoch chart, token distribution. Delegation Flows chart shows inflow/outflow bar chart with current-vs-previous period comparison and net GRT summary.
- **Intel Feed** — Live protocol intelligence panel with governance proposals, GIP updates, epoch summaries, and announcements sourced from The Graph Forum, GitHub, and on-chain data
- **Indexer Directory** — Sortable/filterable table with stake, delegation capacity, reward cuts, delegation-parameter cooldown remaining, REO eligibility indicators, recent delegation activity icons, and mobile card view
- **Indexer Profiles** — Detailed view with active and historical/closed allocations, operator addresses, disputes & slashing history, delegator breakdown, Horizon service provisions, REO eligibility assessment, recent delegation activity, and reward cut change alerts
- **Accurate APR & Effective Cut** — Per-allocation signal-weighted APR calculation and effective cut formula matching [grtinfo](https://github.com/ellipfra/grtinfo)
- **Delegator Portfolio** — Position tracking with Active/Thawing/Withdrawable status badges, rebalancing insights, underperforming position detection, CSV export
- **Curator Portfolio** — Signal positions and query-fee-to-signal ratio analysis across all curators
- **Curate** — Wallet-connected curation tool: signal and unsignal on subgraphs, manage your own signal portfolio, search deployments by name or IPFS hash, and track per-position query-fee yield
- **Subgraph Dock** — Developer studio for subgraph publishers: connect with your Studio account, view published subgraphs and sync status, manage metadata (name, description, image, website), generate deploy keys, query live deployments, and interact with the Sync Bounty Board. Full on-chain lifecycle for published subgraphs — update metadata (`GNS.updateSubgraphMetadata`), transfer ownership and deprecate, each behind a typed irreversibility confirmation. Plus a non-custodial metered query gateway — mint `lod_live_` API keys with a free monthly query allowance, route GraphQL through Lodestar's gateway, and track per-key usage (no deposits, no billing). Plus per-subgraph health alerts — wire a Discord/Slack webhook and get notified when a deployment falls behind, fails, or recovers
- **Subgraph Directory** — Browsable subgraph list with signal/stake ratio highlighting, IPFS manifest complexity scoring (Light→Extreme), category filter (DeFi/NFT/DAO), contract-address search (find subgraphs indexing a given contract), and sorting by signal/stake/query fees or recently created
- **Subgraph Detail** — Embedded GraphiQL playground (schema browser, autocomplete) with the real copyable gateway query URL, deployment version history (semver labels + IPFS hashes), and an activity timeline (version publishes + curator signal events)
- **Horizon Activity Feed** — Live on-chain events from the Horizon staking contract — delegations, self-stakes, provisions, slashing, and withdrawals. Refreshes every 30 seconds. Powered by a self-hosted Amp node querying raw Arbitrum One logs. Gracefully degrades if the node is unreachable.
- **Network-Quality Grades** — Foghorn, our self-hosted correctness judge, grades every indexer A to F from block-pinned probes, status probing and stake data; the grade column, `/foghorn` and `/qos` read it
- **Stake History Charts** — Self-stake and delegation history with cumulative rewards tab
- **Push Protocol Notifications** — Opt-in delegator alerts for reward cut changes and inactive indexer detection. EIP-191 signed subscription; notifications sent via Push Protocol channel
- **One-Click Delegation** — Algorithmically selected indexer with optional preference tuning; smart default with override. See [below](#one-click-delegation).
- **Delegation Calculator** — Model redelegation scenarios with thawing period cost analysis and net gain projections
- **Compare Indexers** — Side-by-side comparison of up to 3 indexers
- **POI Consensus Dashboard** — Divergence detection and stake-weighted consensus across active deployments
- **GraphTally / TAP Payments** — Escrow balances, RAV redemptions, top collectors, and per-indexer payment detail
- **Indexing Health** — Chain-by-chain indexing lag monitoring, sync progress, and subgraph health across the network
- **AI / MCP Directory** — Curated directory of Graph-ecosystem MCP servers and AI tools at `/ai`
- **Blog** — Technical writeups on indexer infrastructure, Graph Node architecture, Amp self-hosting, and Horizon tooling
- **Wallet Connection** — Connect via MetaMask, WalletConnect, or Coinbase Wallet (Arbitrum only)
- **Mobile-First Layout** — Bottom tab navigation, table-to-card patterns, responsive grids, touch-friendly targets

## Roadmap

### Planned

- [ ] PWA support — installable to home screen for daily portfolio checking
- [ ] Amp node reconnection — re-enable Horizon Activity live feed with persistent Amp connection

### Shipped

- [x] **v4.0.0 — Hardening campaign complete.** Logic-tier test coverage lifted 33% → **86%** (1,500+ tests across lib/API/hooks) with a ratcheting CI gate; full security audit (`SECURITY_AUDIT_V4.md`) with every actionable finding fixed — SSRF defence (shared guard + DNS-rebinding check), real per-instance rate limiting, gateway error redaction, an unhandled-rejection fix in the cache layer; plus the v3.4.0 infra/security work below.
- [x] Security & infra hardening (v3.4.0) — forced-TLS Postgres (`sslmode=require`) and TLS-only Redis (`rediss://`, plaintext port firewalled); fixed all high-severity `axios` CVEs; fail-closed timing-safe cron auth; GraphQL-injection + SSRF guards on the indexer-agent proxy; gateway deployment-id validation; timing-safe session HMAC; signature-gated push unsubscribe; offsite pull-model Postgres backups. Green CI gate (lint/type-check/tests/build) with ratcheting coverage. See `SECURITY_AUDIT_V4.md`
- [x] Subgraph health alerting — per-subgraph Discord/Slack webhook alerts, edge-triggered (lagging/failed/recovered), via a 15-min cron that queries each indexer's `/status` endpoint (see `GAP_ANALYSIS.md`)
- [x] Metered query gateway (RFC-004 Phase A) — non-custodial: mint `lod_live_` keys in the Dock, metered proxy at `/api/gateway/[key]`, free-tier caps (5k/user, 90k global kill-switch), per-key usage dashboard. No deposits/billing — the paid prepaid-GRT step is gated on a legal review (see `GAP_ANALYSIS.md`)
- [x] Studio replacement — on-chain subgraph lifecycle in the Dock (`GNS.updateSubgraphMetadata` / `safeTransferFrom` / `deprecateSubgraph`, each behind a typed irreversibility confirmation) plus a "Recently Created" sort on the subgraph directory (see `GAP_ANALYSIS.md`)
- [x] Explorer/Studio parity batch — GraphiQL playground, subgraph version history & activity log, real gateway URL, closed allocations, disputes/slashing + operator addresses, cooldown column, per-epoch status table, total-supply & issuance stats, category filter, contract-address search, Withdrawable badge (see `GAP_ANALYSIS.md`)
- [x] Delegation Flows period comparison — current vs previous window with net GRT and % change (v2.29.0+)
- [x] Horizon Activity feed — live Amp-powered on-chain event stream (v2.6.0)
- [x] Push Protocol delegator notifications — opt-in alerts for cut changes and inactive indexers (v2.6.0)
- [x] QoS performance charts — query count, success rate, latency, blocks-behind (v2.6.0)
- [x] Stake history charts + cumulative rewards tab (v2.6.0)
- [x] AI / MCP directory at `/ai` (v2.6.0)
- [x] One-click delegation — algorithmic indexer selection with preference tuning, smart default with override
- [x] GraphTally / TAP payment pipeline — escrow balances, redemptions, per-indexer detail
- [x] Indexing health — chain lag monitoring, sync status across deployments
- [x] POI Consensus Dashboard — divergence detection, stake-weighted consensus
- [x] REO (Rewards Eligibility Oracle) heuristic — eligibility indicators in indexer table and detailed assessment on profiles (GIP-0079)
- [x] Recent delegation activity — delegation/undelegation events on indexer profiles, activity indicators in the directory
- [x] Reward cut change alerts — flagged in indexer table and profile when parameters changed within 30 days
- [x] Accurate APR and effective cut using per-allocation signal-weighted rewards (grtinfo method)
- [x] Protocol Intelligence Feed with forum governance, GIP commits, epoch summaries
- [x] Mobile-first responsive overhaul with bottom tab bar and card views
- [x] Delegation calculator with redelegation cost modelling
- [x] Indexer comparison tool (up to 3 side-by-side)
- [x] Real subgraph data throughout (no mock data in production)

## Indexer Scoring

Each indexer receives a composite score (0–100) across eleven dimensions, combined with transparent weights. The score is designed for delegator decision-making — higher is better.

### Dimensions & Weights

| Dimension | Weight | What it measures |
|---|---|---|
| **REO Compliance** | 20% | Rewards Eligibility Oracle status (GIP-0079). Eligible with runway = 100, ineligible = 0. Oracle-sourced data gets full marks; heuristic fallback = partial credit. |
| **Allocation Efficiency** | 13% | Allocated tokens ÷ provisioned tokens. Higher utilisation = more operationally competent. 80%+ = 100, no allocations = 0. |
| **Self-Stake** | 12% | Absolute GRT staked by the indexer — skin in the game. Scored on raw amount, **not** as a ratio of total stake. Having more delegation does *not* reduce this score. Anchors: 100K (protocol minimum) = 35, 500K = 65, 1M = 80, 10M+ = 100, with linear interpolation between points. |
| **Delegator Cut** | 10% | How much of the earnings delegators actually keep. Uses **effective cut** (what delegators actually experience, accounting for indexer's own stake ratio) when available, falling back to raw cut. 0% cut = 100, 25% = 60, 50% = 35, 100% = 0. 100% query fee cut applies a further -15 penalty. |
| **Delegation Safety** | 9% | How close the indexer is to maximum delegation capacity (self-stake × 16). Lower utilisation = more room for new delegators without reward dilution. <50% used = 100, 100% full = 0. |
| **Transparency** | 8% | Has the indexer set an ENS name (+40), website URL (+30), and display name (+30)? Presence and accountability signals. |
| **Delegator APY** | 8% | Actual returns delivered to delegators. Uses 30-day rolling realised APY from closed allocations when available, falling back to estimated APR from current allocations. Anchors: 20%+ = 100, 10% = 75, 5% = 50, 1% = 20, 0% = 0. New indexers with strong returns benefit directly. |
| **Data Service Coverage** | 5% | Distinct Horizon data services provisioned to. Supporting multiple services (Subgraph Service, Dispatch JSON-RPC, etc.) signals broader protocol commitment. 1 service = 40, 2 = 75, 3+ = 100. |
| **Query Volume** | 6% | Cumulative query fees collected in GRT — proof the indexer serves real query traffic. Anchors: 100K+ GRT = 100, 50K = 90, 10K = 70, 1K = 50, >0 = 15, 0 = 0. |
| **Cut Stability** | 6% | How long since the indexer last changed reward/query fee parameters. Longer = more predictable. 180+ days = 100, <7 days = 30. Bonus +10 if a cooldown period is set. Hard cap for greedy cuts (100% reward cut → forced to 5). |
| **Delegation Trend** | 3% | 7-day net delegation flow as a percentage of total delegated stake. Positive inflow = crowd confidence; outflow = warning. Low weight because it's inherently noisy. No delegation = neutral 50. |

### Grades

| Score | Grade |
|---|---|
| 80–100 | A |
| 65–79 | B |
| 50–64 | C |
| 35–49 | D |
| 0–34 | F |

### Design Principles

- **No black boxes** — every dimension, weight, and threshold is visible in [`src/lib/risk-score.ts`](src/lib/risk-score.ts)
- **Zero extra API calls** — scores are computed from data the enrichment pipeline already fetches
- **Delegation-neutral self-stake** — attracting delegation is a sign of trust, not something to penalise
- **Delegator-first** — the score explicitly penalises high cuts; an operationally excellent indexer that takes 100% of rewards still scores poorly because delegators earn nothing
- **Feedback welcome** — if the weights or thresholds feel off, [open an issue](https://github.com/nightswatchhq/lodestar/issues)

## One-Click Delegation

`/delegate` is the simplest path to delegating GRT. Connect a wallet, enter an amount, confirm — we handle indexer selection. No research required.

### How it works

**1. Hard filters** — applied at request time, not cached:

- REO ineligible → excluded
- Delegation capacity ≥ 90% → excluded
- Reward cut ≥ 90% → excluded

**2. Preference-weighted scoring** — the existing per-indexer `scoreBreakdown` (computed nightly by the cron) is re-weighted based on four optional sliders:

| Preference | Boosts |
|---|---|
| Best returns | `delegatorAPY`, `delegatorCut` |
| Stability | `cutStability` |
| Safety | `overDelegation`, `selfStake` |
| Network contribution | `queryVolume`, `allocationEfficiency`, `reo` |

Each slider runs 0–10, default 5 (neutral = standard weights). At 10 the relevant dimension weights are doubled; at 0 they are zeroed. Weights are re-normalized to 100 after adjustment.

**3. Rank and pick** — dot product of adjusted weights × dimension scores across all eligible indexers. The top result is selected. The three highest-contributing dimensions become the "why we picked this" reasons shown in the card.

With default preferences this is effectively "highest overall risk score among REO-eligible, non-full indexers." Adjusting preferences shifts emphasis without changing the underlying scoring model.

### UX flow

1. Page loads → recommendation fetched automatically with default weights
2. Recommended indexer shown: name, grade, three reasons
3. Enter amount → approve (first time only) → delegate
4. Optional: expand "Customise selection" → adjust sliders → recommendation updates live

The approval step is skipped on subsequent delegations if the existing GRT allowance covers the amount. First-time delegators need two transactions; all others need one.

Code: [`src/app/delegate/`](src/app/delegate/) · API: [`src/app/api/delegate/recommend/`](src/app/api/delegate/recommend/)

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- React 19, TypeScript 5, Tailwind CSS 4
- wagmi v3 + viem (Arbitrum One)
- @tanstack/react-query + @tanstack/react-table
- Recharts (area charts, donut charts)
- [**nuthatch**](https://www.nuthatch-indexer.com) — our own self-hosted indexer. Every protocol figure on the dashboard comes from a nest over SQL. There is no Graph gateway client in the repo and no API key (see [Where the data comes from](#where-the-data-comes-from))
- Self-hosted Postgres 16 (postgres.js, forced TLS) + self-hosted Redis (TLS / `rediss://`), with an in-memory cache fallback
- Arbitrum One and Ethereum mainnet JSON-RPC (viem) for the few values only the chain has: ENS, REO eligibility, provisions, TAP, the service census
- CoinGecko + DefiLlama (price/TVL)
- [Foghorn](https://github.com/nightswatchhq/foghorn) — our self-hosted network-quality judge, behind `/foghorn` and `/qos`
- Amp (`ampd`) — optional self-hosted on-chain event indexer for Horizon event history
- Push Protocol + APNs — opt-in delegator notifications

## Where the data comes from

This section is the source of truth for what Lodestar reads and from where. If the code and this
section disagree, one of them is wrong and it is a bug either way.

Lodestar reads no third-party data API. Since 2026-09-06 (nuthatch#1160, Lodestar #91 to #95) there
is no Graph gateway client, no `GRAPH_API_KEY` and no fallback. Every protocol number on the dashboard
comes from one of three places:

1. **A nuthatch nest, over SQL.** [nuthatch](https://www.nuthatch-indexer.com) is the single-binary
   indexer we run ourselves. It indexes the Graph Protocol contracts on Arbitrum One directly and
   exposes each event as a table over a guarded `GET /sql?q=` surface. One origin (`NUTHATCH_URL`,
   basic auth) fronts every nest and a path prefix picks the nest.
2. **Lodestar's own Postgres**, filled by the crons in `vercel.json`, which themselves read the nests
   or the chain.
3. **A live contract read** over JSON-RPC, for the handful of values only the chain has.

The rule for a nest route (`docs/nuthatch-migration.md`): it consults the nest's `/ready` before
answering, it carries the nest's `as_of` and `sealed_through` in the response so a caller can date the
answer, and when the nest is unavailable it returns an error with the nest's own reason. It never
serves stale data as fresh and never falls back to another source. Every nest-served panel shows an
**"⚡ Indexed by nuthatch"** badge.

### The nests

All five run on one host. `NUTHATCH_*_BASE_PATH` variables (see `.env.example`) override a route's
path when a nest has to be staged elsewhere; nothing else about nest selection is configurable and
there are no per-surface feature flags.

| Path | Nest | Chain | Indexes | Read by |
|---|---|---|---|---|
| `/alloc` | [`graph-allocations-nest`](https://github.com/nightswatchhq/graph-allocations-nest) | Arbitrum One | The protocol: HorizonStaking, SubgraphService, L2Curation, EpochManager, DisputeManager, PaymentsEscrow and GraphTally, plus the `lodestar_*` views authored for these routes | `/api/indexers`, `/api/indexer/[address]`, `/api/indexer-status`, `/api/indexer-stake-history`, `/api/apr-provenance`, `/api/network-stats`, `/api/grt-flow`, `/api/epochs`, `/api/token-metrics`, `/api/provisions`, `/api/portfolio`, `/api/rewards-history`, `/api/curators`, `/api/payments`, `/api/poi`, `/api/delegation-events`, `/api/delegation-flows` (Horizon era), `/api/feed` (epoch summaries), `/api/subgraph-deployments`, `/api/subgraph-fees-30d`, `/api/subgraph-curation`, `/api/subgraph-history`, `/api/subgraph-versions` (signal and stake figures), `/api/indexing-status`, `/api/disassembly` (signal). Crons: `refresh`, `ingest-epochs`, `ingest-delegations`, `ingest-allocations`, `ingest-disputes`, `ingest-rav`, `ingest-horizon-activity`, `tap-provision`, `warm-ipfs` |
| `/gns` | [`graph-gns-nest`](https://github.com/nightswatchhq/graph-gns-nest) | Arbitrum One | L2GNS: `SubgraphPublished`, `SubgraphVersionUpdated`, `SubgraphMetadataUpdated`, `SubgraphUpgraded`, `SubgraphDeprecated`, `LegacySubgraphClaimed`, `SetDefaultName` | `/api/developer-activity`, `/api/subgraph-names`, `/api/subgraph-search`, `/api/subgraph-versions`, `/api/subgraph-deployments` (names and metadata). Cron: `warm-ipfs` |
| `/dips` | [`dips-nest`](https://github.com/nightswatchhq/dips-nest) | Arbitrum One | Direct Indexer Payments: IssuanceAllocator, RecurringAgreementManager, RecurringCollector | `/api/dips`, `/api/dips/agreements`. Crons: `check-dips`, `check-dips-chain` |
| `/dips-sepolia` | `dips-nest-sepolia` | Arbitrum Sepolia | The same three DIPS contracts, on the chain where the agreement lifecycle has rows | The public SQL playground, and `/api/dips/agreements` when `NUTHATCH_DIPS_BASE_PATH=/dips-sepolia` |
| `/legacy-flows` | `graph-staking-legacy-history` | Arbitrum One | A frozen archive of pre-Horizon Staking delegation (`StakeDelegated`, `StakeDelegatedLocked`). Served read-only and never advances | `/api/delegation-flows` (pre-Horizon era) |

Two routes, `/api/delegation-events` and the Horizon half of `/api/delegation-flows`, ask the origin's
bare `/sql` path rather than `/alloc`. The host's catch-all points that at the same nest, as does
`/horizon`, which `NUTHATCH_HORIZON_BASE_PATH` still names. The public SQL playground at `/sql`
(`/api/sql/*`) exposes exactly the five datasets above, by the allowlist in `src/lib/sql-datasets.ts`.
The `check-nest-health` cron probes each dataset's `/ready` every fifteen minutes and alerts when a
live nest stops following the chain; the archive is exempt because it is meant to be stalled.

### Lodestar's own Postgres

The crons write and the routes read. Nothing in Postgres comes from anywhere but a nest, the chain,
or a user of the site.

| Cron | Schedule | Reads | Writes |
|---|---|---|---|
| `refresh` | every 5 min | `/alloc` (indexers, allocations, delegation events, closed allocations, exchange-rate history, provisions); ENS over mainnet RPC | `indexers`, `indexer_snapshots`, `parameter_changes`, the scores behind `/api/indexers-enriched` and `/api/delegate/recommend` |
| `ingest-epochs`, `ingest-delegations`, `ingest-allocations`, `ingest-disputes`, `ingest-rav` | 10 min to 6 h | `/alloc` | `epochs`, `delegation_events`, `allocations`, `disputes`, `rav_redemptions` |
| `snapshot-network` | every 5 min | `/alloc` (`lodestar_network`) | `network_snapshots`, behind the staking trend chart |
| `ingest-horizon-activity` | every 2 min | `/alloc` delegation events and newest provisions | Redis, read by `/api/horizon/activity` |
| `tap-provision` | every 5 min | `/alloc` indexer URLs; chain (TAP, REO); IPFS | provision and bounty state for the Dock |
| `reconcile-bounties` | every 10 min | chain (BountyBoard, REO) | bounties |
| `check-dips`, `check-dips-chain` | 10 min, hourly | `/dips`; chain | the notification queue |
| `check-provider-liveness` | every 15 min | the data-service registry on chain, then each advertised endpoint | provider liveness, read by `/api/provider-liveness` |
| `check-nest-health` | every 15 min | each nest's `/ready` | nest health and alerts |
| `refresh-chain-health` | every 30 min | indexers' own `/status` endpoints | Redis, read by `/api/chain-lag` and `/api/dropped-chains` |
| `warm-ipfs` | every 10 min | `/gns` metadata hashes, then IPFS | the subgraph metadata and manifest cache (migrations 018 and 019) |
| `dispatch-notifications` | every 10 min | `disputes`, `push_subscriptions` | APNs deliveries |

Routes that read Postgres directly, with no nest in the path: `/api/indexer/[address]/pnl` and
`/revenue`, `/api/indexer-disputes`, `/api/parameter-history`, `/api/rewards-history` (rewards half),
`/api/token-metrics`, `/api/analytics/*`, `/api/health`, the Dock (`/api/studio/*`), Scuttlebutt, push
subscriptions, votes, Lodie's history, and the servability rounds behind `/api/indexing-status`.

### Everything else

| Source | Used for | Configured by |
|---|---|---|
| Arbitrum One JSON-RPC | REO eligibility (`/api/reo`), staking pool reads for APR provenance, TAP, the service census and operator preflight, DIPS chain checks, provider liveness, GRT supply | `ARBITRUM_RPC_URL` |
| Ethereum mainnet JSON-RPC | ENS names (`/api/ens`, the refresh cron) | `MAINNET_RPC_URL`; three public endpoints when unset |
| IPFS | subgraph manifests and metadata behind the GNS hashes, Dock uploads, the disassembly tool | `GRAPH_IPFS_URL`, default `https://api.thegraph.com/ipfs` |
| Indexers' own endpoints | indexing status, chain lag, dropped chains, node health and servability probes (SSRF-guarded) | none |
| CoinGecko, DefiLlama | `/api/price`, `/api/tvl` | none |
| The Graph forum, GitHub | governance and GIP items in `/api/feed` | `GITHUB_TOKEN` |
| Foghorn | `/foghorn`, `/qos`, the indexer grade column, `/api/qos/capture` | `FOGHORN_API_URL`; the pages degrade when unset |
| Amp (`ampd`) | `/api/horizon/events`, `/slashing`, `/debug` | `AMP_ENDPOINT`, `AMP_TOKEN`; optional |
| Ollama | Lodie (`/api/lodie/*`) | `OLLAMA_URL`, `OLLAMA_SECRET` |
| Push Protocol, APNs | delegator notifications | `PUSH_*`, `APNS_*` |
| Indexer agent management API | `/api/indexer/present-poi` (bounty POI claims) | `INDEXER_AGENT_URL`, `INDEXER_AGENT_TOKEN` |
| The Graph gateway, paid per query in USDC over x402 | `/api/x402/query` only: a keyless proxy for callers who bring their own wallet. Nothing on the dashboard reads it | `X402_CHAINS`, `X402_CHAIN_IDS` |
| Seahorn PostgREST | `/api/seahorn/*` | `DISPATCH_GATEWAY_URL`. The built-in default points at a host that no longer serves; see the data-services catalogue |

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Postgres connection string (`postgresql://user:pass@host:port/db?sslmode=require`) | Yes |
| `REDIS_URL` | Redis connection string (`rediss://` for TLS). Falls back to a process-local in-memory cache when unset | No |
| `CRON_SECRET` | Random string to protect cron endpoints (auth fails closed if unset) | Yes |
| `NUTHATCH_URL` | The origin fronting every nest, e.g. `https://nuthatch.<host>.sslip.io`. Every protocol panel fails closed without it | Yes |
| `NUTHATCH_USER`, `NUTHATCH_PASSWORD` | Basic auth in front of that origin | Yes |
| `NUTHATCH_*_BASE_PATH` | Per-route nest path overrides; defaults are the production layout. See `.env.example` | No |
| `SERVABILITY_DEAD_ROUNDS` | Consecutive probe rounds with no serving operator before a subgraph is called dead (default 3) | No |
| `ARBITRUM_RPC_URL` | Arbitrum One JSON-RPC for REO, TAP, staking-pool reads and the service census | Yes |
| `MAINNET_RPC_URL` | Ethereum mainnet JSON-RPC for ENS; public endpoints are used when unset | No |
| `GRAPH_IPFS_URL` | IPFS API for manifests and Dock uploads (default `https://api.thegraph.com/ipfs`) | No |
| `GITHUB_TOKEN` | GitHub PAT for the Intel Feed (forum/GIP data) | Yes |
| `NEXT_PUBLIC_SITE_URL` | Production URL e.g. `https://lodestar-dashboard.com` | Yes |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project id for the wallet connector | Yes |
| `FOGHORN_API_URL` | Base URL of the self-hosted Foghorn API. `/foghorn`, `/qos` and the grade column degrade without it | No |
| `OLLAMA_URL`, `OLLAMA_SECRET` | Local inference for Lodie | No |
| `SESSION_SECRET` | Secret for Studio and Scuttlebutt session HMAC | No |
| `TAP_SIGNER_PRIVATE_KEY` | Private key for TAP receipt signing | No |
| `TATTLER_ISSUER_KEY` | Signs the receipts returned by `/api/sql/receipt` | No |
| `NEXT_PUBLIC_BOUNTY_BOARD_ADDRESS` | Deployed BountyBoard contract address | No |
| `AMP_ENDPOINT`, `AMP_TOKEN` | Self-hosted `ampd` endpoint and proxy token for Horizon event history | No |
| `PUSH_CHANNEL_ADDRESS`, `PUSH_CHANNEL_PRIVATE_KEY`, `PUSH_ENV` | Push Protocol channel (`staging` or `prod`) | No |
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC`, `APNS_AUTH_KEY_BASE64`, `APNS_PRODUCTION` | Apple push for the iOS shell | No |
| `INDEXER_AGENT_URL`, `INDEXER_AGENT_TOKEN` | Indexer agent management API and its `user:pass` | No |
| `DISPATCH_GATEWAY_URL` | PostgREST endpoint for Seahorn swap data | No |
| `X402_SELL_PAY_TO`, `X402_SELL_PRICE`, `X402_SELL_NETWORK` | The x402 paywall on `/api/sql/named`. Off unless all are set; settlement is not built | No |
| `X402_CHAINS`, `X402_CHAIN_IDS`, `NEXT_PUBLIC_X402_NETWORK` | The x402 buyer side behind `/api/x402/query` | No |
| `SCUTTLEBUTT_ADMIN_SECRET` | Admin login password for Scuttlebutt (moderation). Auth fails closed if unset | No |
| `SCUTTLEBUTT_TRIP_SALT` | HMAC salt for tripcodes; without it trips are guessable | No |
| `SCUTTLEBUTT_IP_PEPPER` | HMAC pepper for hashing poster IPs (raw IPs are never stored) | No |
| `SCUTTLEBUTT_EXTRA_BLOCKWORDS` | Comma-separated extra words for the profanity mask | No |
| `ANALYTICS_SECRET` | Protects `/api/analytics/stats` | No |
| `BETTER_STACK_SOURCE_TOKEN`, `LOG_LEVEL` | Log shipping and verbosity | No |

Horizon event history (`/api/horizon/*`), Push notifications, Foghorn, Lodie and Seahorn all degrade gracefully when their env vars are absent. The nests do not: without `NUTHATCH_URL` every protocol panel reports an error, by design.

Scuttlebutt (`/scuttlebutt`) is the anonymous chat: persistent history in Postgres, live delivery via Redis pub/sub → SSE, old-school `Name#secret` tripcodes, a flood/profanity guard, and admin (cookie signed with `SESSION_SECRET`) moderation — soft-delete and ban by IP-hash or tripcode. With no `DATABASE_URL` the page reports unavailable; with no `REDIS_URL` it falls back to history reads only (no live push).

## Database Backups

The lodestar Postgres database (on the primary VPS) is backed up nightly to a separate offsite VPS using a **pull model**: the backup box reaches into the primary and pulls a compressed `pg_dump`, rather than the primary pushing out. If the primary is ever compromised, the attacker has no path to the backups.

```
PRIMARY (DB host)                          BACKUP (offsite)
  Postgres :5433        nightly 03:17 UTC    pull-lodestar-backup.sh (cron)
  lodestar-dump-stdout.sh  ◀──── SSH ────────  pulls + verifies + retains
        │                  forced-command key        ↓
        └── pg_dump -Fc ──────────────────▶  daily/ (7) · weekly/ (4) · monthly/ (6)
```

- **`scripts/lodestar-dump-stdout.sh`** — runs on the primary. Emits a compressed `pg_dump -Fc` of `lodestar` to stdout via local peer auth (no DB password on disk). This is the *only* thing the backup key is permitted to run — it's wired as a forced command in the primary's `authorized_keys`, locked down with `no-pty,no-port-forwarding,...`, so a stolen key can do nothing but request a dump.
- **`scripts/pull-lodestar-backup.sh`** — runs on the backup box via cron (daily 03:17 UTC). Pulls the dump, **verifies it before keeping it** (size, `PGDMP` magic, table count), files it into `daily/`, then hardlink-promotes to `weekly/` (Sundays) and `monthly/` (1st of month). Retention: **7 daily / 4 weekly / 6 monthly**.

Dumps are custom-format (`-Fc`). Restore with:

```bash
pg_restore -h <host> -p <port> -U postgres -d <db> --no-owner --no-acl lodestar-<ts>.dump
```

Restores are periodically test-verified against a throwaway Postgres container. These are nightly logical dumps (no point-in-time recovery) — appropriate for an analytics DB that re-ingests from chain.

## Project Structure

```
src/
  app/            # Next.js pages and API routes
    api/          # Route handlers: nest-backed protocol reads, crons, SQL playground, Dock, push, Scuttlebutt
    activity/     # Live Horizon on-chain event feed
    ai/           # AI / MCP tool directory
    blog/         # Technical blog (Markdown posts)
    calculator/   # Redelegation calculator
    compare/      # Indexer comparison tool
    curate/       # Wallet-connected curation tool (signal/unsignal)
    curators/     # Curator directory
    data-services/# Horizon data-service catalogue and provider census
    delegate/     # One-click delegation
    delegators/   # Delegator portfolio
    disassembly/  # Subgraph disassembly and verification
    dock/         # Subgraph developer studio (publish, metadata, deploy keys, bounties)
    foghorn/ qos/ # Network-quality grades and probes, from Foghorn
    grt-flow/     # GRT supply and flow views
    indexers/     # Indexer directory + profiles
    indexing/     # Chain health and subgraph indexing status
    network/      # Protocol overview
    operate/      # Operator preflight
    payments/     # GraphTally / TAP payment pipeline
    poi/          # POI consensus dashboard
    profile/      # Connected wallet portfolio
    scuttlebutt/  # Anonymous chat
    sql/          # Public SQL playground over the nests
    subgraphs/    # Subgraph directory and detail
  components/     # UI components, layout, charts, tables, feed
  content/        # Blog posts (Markdown)
  data/           # Static catalogues (data services, roadmap)
  hooks/          # React Query hooks
  lib/            # Nest client and queries, Postgres, cache, chain reads, utilities
    ingest/       # Postgres ingestion pipeline (indexers, allocations, epochs, delegations, disputes, RAVs)
    notifications/# Cron-driven alerting (DIPS, liveness, nest health, disputes)
```

## Contributing

Issues and feedback welcome at [github.com/nightswatchhq/lodestar/issues](https://github.com/nightswatchhq/lodestar/issues).

## License

MIT
