---
title: "Lodestar Now Reads No Graph Subgraph At All"
date: "2026-09-07"
author: "cargopete"
tags: ["lodestar", "nuthatch", "the-graph", "indexing", "self-hosting", "arbitrum", "horizon", "subgraphs", "migration"]
category: "Infrastructure"
excerpt: "In July we moved two panels off The Graph and said the rest was a long road. On 6 September the last of it landed: there is no gateway client in the Lodestar repo, no GRAPH_API_KEY, and no fallback. Every protocol number on the dashboard now comes from a nest we run ourselves. Here is what moved, what we deleted instead of moving, and what still talks to a gateway on purpose."
---

*In [July](/blog/lodestar-runs-on-nuthatch) we moved two panels off The Graph and were careful to say that "the whole dashboard" was a long road of panels, each with its own aggregation quirks to reproduce faithfully. On **6 September** the last of that road closed. There is no Graph gateway client in the Lodestar repository, no `GRAPH_API_KEY`, and no fallback path. Every protocol figure on the dashboard is served by a nuthatch nest we run ourselves. This is the accounting: what moved, what we deleted rather than moved, what still queries a gateway deliberately, and what is still somebody else's.*

---

## Seven weeks ago it was two panels

The July post migrated the delegation-activity feed and the developer-activity chart, held them to byte-for-byte parity on the first and a documented one-subgraph divergence on the second, and ran both nests in 86 MB of resident memory on one small VPS. It ended with an honest list of what had not been done: the QoS data still came from The Graph's free tier, and indexers, allocations, epochs and payments were all still on the gateway.

That list is now empty. Not because every line on it was migrated, which would be a nicer story and a false one, but because each line was either migrated, deleted, or reclassified as something an indexer cannot answer by construction. The interesting part of this post is the second and third categories.

## What actually shipped

Five pull requests, all merged on 6 September 2026, tracked as `nuthatch#1160`:

- **#91** moved provisions, tally collections and delegation events onto `/alloc`, and retired the separate horizon and staking nests into it.
- **#92** took the ingest, refresh and cron paths off the gateway, and deleted the fallbacks and the key-only scripts.
- **#93** switched eleven request-time routes to read the nest only, and removed the gateway tails behind them.
- **#94** did the last seventeen gateway callers.
- **#95** removed the Graph API key itself, the client, and the per-surface flags that had been gating the switchover.

Across the five: **108 files changed, 1,293 insertions, 6,529 deletions.** Taking the dependency out left the codebase 5,236 lines smaller than it was with it in. `src/lib/subgraph.ts`, which was the gateway client, no longer exists. No route and no cron reads `GRAPH_API_KEY`, and the key is deleted from Vercel rather than merely unused.

The `NUTHATCH_*` per-surface feature flags went with it. They existed so a route could be flipped between the nest and the gateway during parity work. With nothing on the other side of the switch, a flag is just a way to break production on a typo.

## Three places a number can come from

The dashboard's data provenance is now small enough to state completely:

1. **A nuthatch nest, over SQL.** One origin behind basic auth, with a path prefix selecting the nest, and each decoded event exposed as a table on a guarded `GET /sql?q=` surface.
2. **Lodestar's own Postgres**, filled by the crons in `vercel.json`, which themselves read either the nests or the chain.
3. **A live contract read over JSON-RPC**, for the handful of values that only exist as chain state: ENS, rewards-eligibility, provisions, TAP, the service census.

There is no fourth place. If the code and that list ever disagree, one of them is a bug, and we would rather find out which.

## The five nests

All five run on one host, all on nuthatch 2.7.1.

| Path | Nest | Indexes |
|---|---|---|
| `/alloc` | `graph-allocations-nest` | HorizonStaking, SubgraphService, L2Curation, EpochManager, DisputeManager, PaymentsEscrow and GraphTally, plus the `lodestar_*` views written for these routes |
| `/gns` | `graph-gns-nest` | L2GNS publication history: `SubgraphPublished`, `SubgraphVersionUpdated`, `SubgraphMetadataUpdated`, `SubgraphUpgraded`, `SubgraphDeprecated`, `LegacySubgraphClaimed`, `SetDefaultName` |
| `/dips` | `dips-nest` | Direct Indexer Payments: IssuanceAllocator, RecurringAgreementManager, RecurringCollector |
| `/dips-sepolia` | `dips-nest-sepolia` | The same three contracts on Arbitrum Sepolia, which is where the agreement lifecycle actually has rows |
| `/legacy-flows` | `graph-staking-legacy-history` | A frozen archive of pre-Horizon delegation: `StakeDelegated` and `StakeDelegatedLocked` |

`/alloc` carries most of the dashboard: indexers, the indexer profile and its stake history, network stats, GRT flow, epochs, token metrics, provisions, portfolio, rewards history, curators, payments, POI, delegation events, epoch summaries in the feed, and the on-chain half of the subgraph pages. Nine crons read it too.

The last row deserves its own paragraph. The current HorizonStaking contract only began late in 2025, and pointing a delegation-flows chart at it alone would have produced a chart that looked perfectly healthy while silently dropping every delegation before that. Our own migration checklist calls this "a particularly tidy sort of fraud", which seems about right. So the legacy nest sealed **504,702 events from block 42,449,585 to 497,849,211**, and then stopped. It serves read-only, holds no RPC configuration and no cursor, and never advances. The live staking data in `/alloc` supplies the tail.

## The rule that made it safe to move this fast

Five PRs in a day is only defensible because the rule underneath them had been settled weeks earlier, and it is a strict one.

**Fail visibly. Never fall back to The Graph, and never serve data without saying how current it is.**

Concretely, a serving route consults the nest's own `/ready` before it answers. `/ready` is the nest's judgement about itself: it returns 503 when quarantined or stalled, and carries `lag_blocks`, `sealed_through` and `cursorless` to explain why. An unready nest produces an error the page can render, with the nest's reason attached. A panel that says "delegation data is three weeks behind" is useful. A panel quietly showing three-week-old numbers is worse than a blank one.

Every response also carries its own freshness, so a caller can date the answer rather than trusting it. That is genuinely better than what we had before, because the gateway cannot tell you how stale a subgraph is.

And no route may fall back. A dual-source route is two sources of truth, one of which is wrong, and the entire point of the migration was to stop guessing which.

There is a small methodological confession attached to that gate. When we went to check which routes actually reported freshness, grepping them for `as_of|sealed_through|stale` returned a hit in four of five, which reads like four of five were fine. Every one of those hits was `stale-while-revalidate` in a `Cache-Control` header, which is HTTP caching and says precisely nothing about the data. Counting matches is not reading them, and the difference here was the whole answer.

## Some of it we deleted instead of migrating

This is the part that does not fit the migration framing, and it is the more honest half of the story.

The gateway QoS oracle ingest is gone, along with everything derived from it: the per-indexer QoS route, the QoS-by-deployment route, the backfill and recompute scripts, and the tables, dropped in `migrations/020_drop_qos_oracle.sql`. In July we listed QoS as the notable thing still on The Graph. It did not move to a nest, because it cannot. Our own nest catalogue lists **Gateway QoS telemetry as blocked**, with the reason stated plainly: the gateway publishes it off chain, and no contract emits it. There is nothing on Arbitrum to index.

So QoS is now measured rather than fetched. [Foghorn](https://github.com/nightswatchhq/foghorn), our self-hosted network-quality judge, serves `/qos` and `/foghorn` from its own probes. That is a different claim from the old one and we would rather say so than quietly swap the backend and keep the label.

Deleted with it: the indexer-trends panel, the conversions and protocols surfaces, the networks registry, the subgraph playground, the metered gateway proxy and its keys, the bounty query proxy, the Studio query proxy, the subgraph-health alert cron and the gateway probe. Every one of them existed only to relay somebody else's query through the gateway. The earlier position had been that the API key would stay configured for exactly these; the decision went the other way, and features that were only a relay were removed rather than kept alive on an exception.

Deleting a feature is a worse outcome than migrating it. It is a better outcome than a checklist that can never be completed, which is what the previous wording promised: remove the client "once every route above is Live", when five of those routes could not be served by an indexer at all. That condition was unreachable, so the list would have sat permanently one item short with no explanation of why.

## What still talks to a gateway, deliberately

Three things, and they are correct as they are:

- `/api/x402/query`, the keyless pay-per-query proxy. The gateway is the product being resold. Removing it would not be a migration.
- `/api/indexer-status/[address]`, which reads indexers' own `/status` endpoints. That is serving telemetry, not chain state.
- `/api/indexing-status/[hash]`, the same shape: which indexers are serving a deployment, and how far behind.

The distinction is simple enough to apply. When the gateway or the indexer is the *subject* of the measurement, no on-chain indexer can answer it, because the thing being measured is the serving.

## What is still somebody else's

"Lodestar reads no third-party data API" is a precise claim and worth keeping precise. It means **protocol** numbers. Three things on the page are still fetched, and none of them is a subgraph:

- **IPFS**, for subgraph display names, schemas and manifests. On chain you get a hash; the meaning lives off chain, and nuthatch forbids IPFS at runtime by design. So the subgraph routes are split rather than migrated: the signal and allocation figures come from `/alloc`, and the name beside them does not and never will. A route is not finished until it can render an unresolved hash honestly instead of silently showing nothing.
- **CoinGecko and DefiLlama**, for price and TVL. Not protocol state, not on Arbitrum, not our business to index.
- **JSON-RPC**, for the values that are chain state rather than events.

ENS is the one that looks like an omission and is not. It lives on Ethereum mainnet, which is a different chain, a different cursor and a different nest. In scope for a future mainnet nest, out of scope for the Arbitrum ones.

## Check it yourself

Every nest-served panel carries an **"⚡ Indexed by nuthatch"** badge. Or read the provenance directly:

```sh
for r in delegation-events network-stats developer-activity payments epochs; do
  curl -s "https://www.lodestar-dashboard.com/api/$r" | jq -r '.source // .data.source'
done
# nuthatch
# nuthatch
# nuthatch
# nuthatch
# nuthatch
```

If a nest is down you will get an error with the nest's own reason in it, and no number at all. That is the intended behaviour and not a regression.

## What this proves, and what it doesn't

It proves the thing the July post could only claim for two panels: a real dashboard, with real users who notice wrong numbers within hours, can serve its entire protocol surface from an indexer it runs itself. Five nests, one host, one binary each, no Postgres or IPFS or firehose scaffolding around them, and no monthly bill to read data about a network you are already part of.

It does not prove that everything on a dashboard can be indexed, and we would be overselling badly if we implied it. QoS could not be, and got measured instead. Names could not be, and stayed on IPFS. Three routes exist to query the gateway and should keep existing. The honest figure is not "one hundred percent of Lodestar", it is "one hundred percent of the protocol data, and a clear list of what that phrase excludes".

The other thing worth saying: none of this was a flag day. It was seven weeks of one route at a time, each gated on parity at a fixed block, each with a rollback that restored a release rather than a hidden second data path. The last five landed in a single day only because the preceding forty-odd had been done properly.

nuthatch is [github.com/nightswatchhq/nuthatch](https://github.com/nightswatchhq/nuthatch) (AGPL-3.0), and the nest catalogue is [github.com/nightswatchhq/nests](https://github.com/nightswatchhq/nests). Both nests serving Lodestar's Graph data are in there, and running one is `nuthatch init --from <repo-url>`.
