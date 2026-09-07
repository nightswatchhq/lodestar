# Research brief: a Rust backend for Lodestar

You are designing, not building. Produce the architecture, the crate choices with reasons, the
module layout, the caching and rate-limiting design, the ingest scheduler, the migration order and
the risk list for a Rust backend that replaces every server-side line of Lodestar. Everything below
is verified against the repository and the machines on 2026-09-06 unless marked *inferred*. Where
you need a fact that is not here, say so and state the assumption you proceed on; do not invent one.

## The one non-negotiable requirement

**The frontend gets 100% of its data from this backend. No exceptions.** Not the nests, not
Postgres, not Redis, not an RPC, not CoinGecko, not IPFS, not an indexer's own status endpoint. If a
component on the page shows a number, that number came over HTTP from the Rust service. The only
things the browser talks to directly are the backend and the user's wallet for signing transactions.

Consequently the backend must do everything the current Next.js route handlers and crons do today,
**plus** act as a rate-limited, caching-heavy proxy in front of the nuthatch nests, so that the nests
see a small, smooth, bounded query load no matter what the browser or a crawler does.

## What Lodestar is

An analytics dashboard for The Graph Protocol on Arbitrum One: network stats, an indexer directory
with a composite score, indexer profiles with APR provenance and PnL, delegator and curator
portfolios, one-click delegation, POI consensus, GraphTally/TAP payments, DIPS, subgraph directory
and detail with a GraphiQL playground, a subgraph developer studio ("the Dock") with bounties,
a public SQL playground over the nests, an anonymous chat (Scuttlebutt), an AI assistant (Lodie),
push notifications, and a Capacitor iOS shell. Repo: `github.com/nightswatchhq/lodestar`
(Next.js 16, React 19, TypeScript). Live at `lodestar-dashboard.com` on Vercel, team `nbgn`.

Since 2026-09-06 there is no Graph gateway client in the repo, no API key, and no fallback path.
Every protocol figure comes from a nest we run ourselves. This is a rule, not a phase: **a route
reads one source, reports its provenance and freshness, and fails visibly when that source is
unavailable.** It never serves stale data as fresh and never falls back to a second source.

## The current backend, by the numbers

| | |
|---|---|
| Route handlers under `src/app/api` | 106 files, 9,527 lines |
| Library code under `src/lib` | 109 files, 18,974 lines, of which ingest 962 and notifications 606 |
| Nest SQL strings | `src/lib/nest-queries.ts` 562 lines, `src/lib/queries.ts` 880 lines |
| Tests | 171 test files, coverage gate at 86% of the logic tier |
| Crons in `vercel.json` | 17 |
| Frontend data hooks | react-query hooks fetching `/api/...`; 32 of 40 pages are client components |

### Three layers, which matter because they migrate differently

**1. The read layer.** Handlers that call a nest over `GET /sql?q=<SQL>`, shape rows, and return
JSON behind a Redis cache. The routes and the nest each one reads:

- `/alloc` (`graph-allocations-nest`, the whole protocol: HorizonStaking, SubgraphService,
  L2Curation, EpochManager, DisputeManager, PaymentsEscrow, GraphTally, plus `lodestar_*` views
  authored for these routes): `/api/indexers`, `/api/indexer/[address]`, `/api/indexer-status`,
  `/api/indexer-stake-history`, `/api/apr-provenance`, `/api/network-stats`, `/api/grt-flow`,
  `/api/epochs`, `/api/token-metrics`, `/api/provisions`, `/api/portfolio`, `/api/rewards-history`,
  `/api/curators`, `/api/payments`, `/api/poi`, `/api/delegation-events`, `/api/delegation-flows`
  (Horizon era), `/api/feed` (epoch summaries), `/api/subgraph-deployments`,
  `/api/subgraph-fees-30d`, `/api/subgraph-curation`, `/api/subgraph-history`,
  `/api/subgraph-versions`, `/api/indexing-status`, `/api/disassembly` (signal).
- `/gns` (`graph-gns-nest`, L2GNS publication events): `/api/developer-activity`,
  `/api/subgraph-names`, `/api/subgraph-search`, `/api/subgraph-versions`, `/api/subgraph-deployments`.
- `/dips` (`dips-nest`, IssuanceAllocator, RecurringAgreementManager, RecurringCollector):
  `/api/dips`, `/api/dips/agreements`.
- `/dips-sepolia`: the same contracts on Arbitrum Sepolia; public SQL only.
- `/legacy-flows` (`graph-staking-legacy-history`, a frozen archive that never advances):
  `/api/delegation-flows` (pre-Horizon era).
- `/api/sql/query`, `/api/sql/named`, `/api/sql/receipt`, `/api/sql/catalog`: the public SQL
  playground, an explicit allowlist of the five datasets above, with read-only SQL pre-screening
  (the nest is the real security boundary), a six-second timeout, and signed receipts (tattler) on
  the named-query tier, with an x402 paywall built but not wired.

**2. The ingest layer.** Crons that read the nests or the chain and write our Postgres:

| Cron | Schedule | Reads | Writes |
|---|---|---|---|
| `refresh` | 5 min | `/alloc` views: indexers, allocations, delegation events, closed allocations, exchange-rate history, provisions; ENS over mainnet RPC | `indexers`, `indexer_snapshots`, `parameter_changes`, the composite scores |
| `ingest-epochs` `-delegations` `-allocations` `-disputes` `-rav` | 10 min to 6 h | `/alloc` | `epochs`, `delegation_events`, `allocations`, `disputes`, `rav_redemptions` |
| `snapshot-network` | 5 min | `/alloc` | `network_snapshots` |
| `ingest-horizon-activity` | 2 min | `/alloc` | Redis |
| `tap-provision` | 5 min | `/alloc`, chain (TAP, REO), IPFS | provision and bounty state |
| `reconcile-bounties` | 10 min | chain (BountyBoard, REO) | bounties |
| `check-dips`, `check-dips-chain` | 10 min, hourly | `/dips`, chain | notification queue |
| `check-provider-liveness` | 15 min | the data-service registry on chain, then each advertised endpoint | provider liveness |
| `check-nest-health` | 15 min | each nest's `/ready` | alerts |
| `refresh-chain-health` | 30 min | indexers' own `/status` endpoints | Redis |
| `warm-ipfs` | 10 min | `/gns` metadata hashes, then IPFS | subgraph metadata and manifest cache |
| `dispatch-notifications` | 10 min | `disputes`, `push_subscriptions` | APNs deliveries |

Postgres tables the crons keep: `indexers`, `indexer_snapshots`, `parameter_changes`, `allocations`,
`delegation_events`, `epochs`, `disputes`, `rav_redemptions`, `network_snapshots`, `cron_runs`,
`servability_rounds`, plus the Dock, push and Scuttlebutt tables. 26 tables, 1.3 GB. Migrations are
numbered SQL files under `migrations/`.

**3. The product layer.** Everything with a session, a signature, a stream or a third party:

- The Dock (`/api/studio/*`): Studio-style auth with a session cookie signed by `SESSION_SECRET`,
  subgraph list and metadata, deploy keys, IPFS uploads, bounties, on-chain lifecycle.
- Scuttlebutt (`/api/scuttlebutt/*`): persistent history in Postgres, live delivery via Redis
  pub/sub to Server-Sent Events, tripcodes, flood and profanity guard, admin moderation, IP hashing.
- Push (`/api/push/*`): EIP-191 signed subscribe and unsubscribe, device registration, APNs via a
  key, Push Protocol channel.
- Lodie (`/api/lodie/*`): chat against a self-hosted Ollama, history in Postgres.
- Votes, analytics, health, `/api/x402/query` (a keyless pay-per-query proxy to The Graph gateway
  for callers with their own wallet), TAP receipt signing, the wasm subgraph disassembler and its
  sandboxed verifier, `/api/foghorn/*` (a proxy to our self-hosted network-quality judge),
  `/api/horizon/*` (Amp, optional), `/api/seahorn/*` (PostgREST, currently dead upstream),
  `/api/ens`, `/api/reo`, `/api/price`, `/api/tvl`, `/api/manifest`, `/api/indexer-node-health`,
  `/api/indexer/present-poi` (indexer-agent management API), `/api/operator-preflight`,
  `/api/service-census`, `/api/delegate/recommend`.

### Outside sources still in the path, all of which the backend must own

Arbitrum One JSON-RPC (REO, TAP, staking pool, service census, DIPS chain checks, GRT supply),
Ethereum mainnet JSON-RPC (ENS, with three public fallbacks), IPFS (`api.thegraph.com/ipfs` by
default), indexers' own `/status` endpoints (SSRF-guarded), CoinGecko, DefiLlama, The Graph forum and
GitHub for the feed, Foghorn, Ollama, Push Protocol, APNs, the indexer-agent API, The Graph gateway
over x402 only.

### The API's consumers other than the browser

Foghorn (our judge, on the Nuremberg box) reads the Lodestar API hourly. Grafana dashboards read the
Postgres directly. The iOS shell reads the same API. Third parties hit the public SQL routes. Keep the
JSON shapes stable or version them; the researcher should propose which.

## The nests, and why the proxy is the point

- One origin fronts every nest: `https://nuthatch.<host>.sslip.io`, basic auth, a path prefix per nest,
  Caddy in front. Each nest exposes `/health`, `/ready`, `/tables`, `/sql?q=`. Table names are
  `<alias>__<event>`. Every `/sql` answer carries `provenance{as_of, sealed_through, registry_hash,
  nid, source}` and `truncated`/`degraded` flags. `/ready` 503s when stalled or quarantined and
  carries `lag_blocks`, `tip`, `last_block`, `sealed_through`.
- **A nest admits 2 concurrent SQL queries by default, 4 on the protocol nest by drop-in, and
  refuses the rest with `503 server busy: too many concurrent SQL queries`.** This is the nest
  protecting itself and is not to be raised.
- The current Node code has a one-slot-per-process gate before the nest. Vercel runs many processes,
  so the nest's permit count is what actually binds, and cron collisions read as `server busy`.
- Several nest views are whole-history folds recomputed per request. Measured cold latencies after
  the cutover: `/api/indexers` 23.5 s, `/api/indexer/<addr>` 17.9 s, `/api/indexer-status/<addr>`
  7.7 s; warm from Redis, 0.18 s. Cache TTLs today are mostly 300 s, some 600 s, some 60 s, with a
  stale-while-revalidate variant.
- The nests are DuckDB over sealed Parquet segments plus a hot store; a query that cannot answer in
  six seconds wants a WHERE clause. The public SQL surface has a per-IP limit that is per edge
  instance today, which is a soft ceiling.
- The protocol nest lives on a 7.7 GB box with `MemoryHigh=2G` and has been memory-exhausted once.
  Load on it is the scarce resource of the whole system.

## Infrastructure the design must fit

| Machine | Spec | Runs |
|---|---|---|
| Helsinki (Hetzner) | 4 vCPU, 7.7 GB, 150 GB | every nest, Caddy, the Nuthatch Data Service gateway, a TAP aggregator, a chat relay, the backup target |
| Nuremberg (Hetzner) | 4 vCPU, 7.7 GB, 75 GB, 65% used | Lodestar Postgres 16 (TLS, port 5433) and Redis (TLS, 6380), Foghorn in docker, an unrelated Rust backend in docker |
| Vercel | Fluid Compute | the frontend and, today, all of the above backend |
| ThinkPad | 32 cores, 62 GB, GPU | local only; not for production |

Decide where the Rust service should run and say why: beside the nests on Helsinki (loopback to the
nests, but a shared memory budget), beside Postgres and Redis on Nuremberg, or a third small box.
Consider a split, with the nest proxy on Helsinki and the rest on Nuremberg, and say whether the
extra hop is worth it. Assume the frontend stays on Vercel and calls the backend cross-origin, or
through a Vercel rewrite; recommend one.

## Known pain to design out

1. Nest concurrency is bounded per Node process, not globally. The Rust service must hold **one
   global admission gate per nest**, sized to the nest's permit count, with a queue and a timeout.
2. No request coalescing: N identical cold requests today produce N nest queries. Single-flight is
   mandatory.
3. Caching is keyed ad hoc per route, with TTLs chosen by hand. Propose a cache policy model: per
   dataset freshness derived from the nest's `as_of` and poll interval rather than a fixed TTL;
   stale-while-revalidate as the default; negative caching for nest errors with a short TTL; a
   warmer that keeps the expensive views hot on the nest's own cadence so no user pays the 23 s.
4. Rate limiting is per edge instance. The Rust service must rate-limit per IP globally, with
   separate budgets for the public SQL routes, the cheap cached routes, and the crons.
5. Crons are HTTP requests with Vercel timeouts and no ordering. The Rust service owns a scheduler
   with staggering, jitter, overlap prevention, a `cron_runs` record per run, and back-pressure from
   the same nest gate the reads use.
6. Provenance is carried inconsistently. Every response from the Rust service should carry the
   nest's `as_of` and `sealed_through` and a `served_from` (`nest`, `cache`, `postgres`, `chain`)
   in a stable header and body field.
7. Fail visibly. An unready nest yields an error with the nest's reason; cached data older than the
   dataset's freshness budget is labelled stale, never silently served as current.
8. SSRF guarding, timing-safe secrets, read-only SQL screening and the rest of the v4 hardening must
   survive the port; list each control and where it lands.

## Constraints and preferences

- Rust, one workspace, one binary if that is sensible, or a small number of binaries with a stated
  reason. The house tooling is `cargo`, `sqlx` with checked queries, and TDD where the project
  already does it. Prefer boring, maintained crates. Justify each one against at least one
  alternative.
- Postgres stays where it is and its schema stays compatible with the existing migrations; propose
  a migration tool. Redis may stay, be replaced by an in-process cache, or both; argue it.
- The nests are not to be modified for this work. Their SQL surface is the contract. Note anything
  that would be dramatically better with a nest-side change, and keep it out of the critical path.
- The browser must never learn the nest origin or credentials.
- The wallet stays in the browser; the backend verifies signatures (EIP-191, EIP-712) and never
  holds a user key. It does hold operator keys (TAP signer, tattler issuer, APNs); say how.
- Observability: structured logs, metrics per route and per nest gate, a `/health` that reflects
  the nests and Postgres, and something Grafana can read.
- Zero-downtime migration from the current app, route by route, with the JSON contract preserved so
  the frontend hooks do not change until the end.

## The bar the new thing must clear

**A migration is only justified if the result beats the current system on every measured number.
Matching is not enough; the migration work has to buy something.** Treat this as a gate on the whole
project, not as a nice-to-have, and design so that clearing it is a consequence of the architecture
rather than a hope.

Measured on production, 2026-09-06, after the nest cutover. These are the baselines to beat:

| Metric | Today | The bar |
|---|---|---|
| `/api/indexers`, cold | 23.5 s | must be dramatically lower, and a user should not meet a cold path at all if the warmer works |
| `/api/indexer/<addr>`, cold | 17.9 s | as above |
| `/api/indexer-status/<addr>`, cold | 7.7 s | as above |
| Any of the above, warm from cache | 0.18 s | must be lower, and the share of requests served warm must be higher |
| Nest queries per unit of user traffic | one per cold request, no coalescing | strictly fewer, with single-flight and a warmer; state the expected ratio |
| `server busy` refusals from the nest | seen in normal operation when crons collide | zero in normal operation, by construction of the global gate |
| Effective per-IP rate limit | per edge instance, so roughly the configured limit times the instance count | exact and global |
| Memory on the host that also runs the nests | the protocol nest is capped at `MemoryHigh=2G` on a 7.7 GB box | the backend must fit beside it without pushing anything into swap; state its budget |
| Cold start | Vercel Fluid Compute, functions warm on demand | a long-lived process, so effectively none; say what replaces it as the risk |
| Test coverage of the logic tier | 86%, with a ratcheting CI gate | at least equal on the ported logic |

Two rules about the measuring, because a benchmark that flatters itself is worse than none:

1. **Measure both systems on the same day against the same nests**, with the same query set, from
   the same place. A soak that goes through Lodestar exercises Lodestar's cache after the first
   pass, not the nest, so drive the comparison from captured nest statements and from real route
   traffic separately, and report them separately.
2. **Report the distribution, not the mean**: p50, p95, p99 and the worst case, for cold and warm
   separately, with the cache hit rate stated. A p50 that improves while p99 degrades is a
   regression for the person who hits it.

Propose the benchmark harness as part of the design: what it drives, from where, how it captures the
baseline before any code is written, and how it runs in CI afterwards so a regression is caught
rather than discovered. If some part of the system cannot be made faster than it is today, say so
plainly and argue whether the rest still justifies the work.

## What to deliver

1. **Architecture**: components, data flow for a cold read, a warm read, a cron run, an SSE stream,
   and a public SQL query. One diagram per flow is welcome; text is fine.
2. **Crate and framework choices** with reasons and the alternative rejected for each: HTTP server,
   router and middleware, HTTP client to the nests, connection pooling, Postgres, cache, rate
   limiter, scheduler, SSE, metrics, logging, config, secrets, EIP-712 and signature verification,
   wasm execution for the disassembler, IPFS and RPC clients.
3. **Module layout** of the workspace, with one sentence per module on what it owns.
4. **The nest proxy design in detail**: admission gate, queueing, timeouts, single-flight, the cache
   policy model, the warmer, provenance propagation, error taxonomy, what a 503 from the nest turns
   into for the browser.
5. **The rate-limit design**: keys, budgets, storage, behaviour at the limit, how crons and Foghorn
   are exempted or budgeted.
6. **The ingest scheduler**: how the 17 jobs are expressed, staggered, recorded and observed, and
   how they share the nest gate with reads.
7. **Deployment**: where it runs, how it is built and rolled, systemd units, TLS, Caddy, how the
   Vercel frontend reaches it, how secrets get to it.
8. **Migration plan**: an ordered list of routes with the reason for the order, the parity check for
   each, the rollback, and what the frontend changes at the end. Say which product-layer pieces are
   hardest and why, and whether any should be rewritten rather than ported.
9. **Risks and open questions**, ranked, each with the cheapest experiment that would settle it.
10. **What you would not do**: the things this brief invites that you think are mistakes.

Write for a senior Rust engineer who will build it. Be concrete about names, types and shapes where
it helps and silent where it would be padding. If a claim in this brief is wrong or contradictory,
say so at the top rather than designing around it.
