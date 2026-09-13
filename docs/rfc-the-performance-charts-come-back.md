# [RFC] The performance charts come back, on nuthatch

**Status:** Draft, 2026-09-13
**Author:** Pete
**Follows:** nightswatchhq/nuthatch#1160 (the removal), `plans/grc-the-lodestar-oracle.md`
**Touches:** `graph-allocations-nest`, `qos-reo-nest`, nuthatch (one slice), kittiwake, this repo

## TL;DR

An indexer asked on 2026-09-13 whether we had removed the performance charts from the indexer page.
We had, on 2026-09-05. `cb61cea` removed **Query Performance** (`IndexerQoSChart`, with
`QosQualityPanel`) and `cd47802` removed **Daily Trends** (`IndexerTrendsChart`). Both read a subgraph
through the gateway, and #1160 took the key away.

Both come back, with no key:

1. **Daily Trends** from a view on `graph-allocations-nest`. Every figure is an Arbitrum event the
   nest already holds. No new capability.
2. **Query Performance** from a Gnosis nest over Edge & Node's own oracle postings: the
   `submitQoSPayload(bytes)` calldata through `[extract] top_level_calls`, and the payloads it points
   at through `[[ipfs]]`. This needs **one nuthatch slice**, because the CID sits inside JSON calldata
   and `[[ipfs]]` cannot read it there today.
3. **A second series on the same charts** from Foghorn's own measurements, which kittiwake already
   proxies. Correctness and latency percentiles, which the oracle cannot publish.
4. **The QoS Quality panel** (grade, four sub-scores, the served-vs-allocated gap, the score history
   and the per-deployment breakdown) and the directory's QoS column, recomputed in kittiwake from
   the same nest at allocation grain.

Parity is exact for the daily series, because the source is the same data read by a different
decoder: rebuilt from a week of raw payloads, daily success rate and fees match the old pipeline to
within 2e-9. What changes on purpose is what the old section did with them: headline figures that
were means of daily means, a daily grain that hid outages, and blocks behind summed across chains
with different block times. The numbers are in "What was wrong with the old section".

## Why #1160 said QoS could not be done, and what changed

#1160 recorded the QoS oracle as "not indexable by nuthatch by design" (it posts through
`callHandlers`, with no events) and removed it. The removal was right: the feature needed the key.
The "by design" was already stale on the day:

- **Top-level calls** shipped on 2026-08-19 (`7e4b4854`, RFC-0038 §5). A nest with
  `[extract] top_level_calls = true` decodes transactions sent directly to its contracts from
  ordinary block bodies. That is exactly what a `callHandler` fires on.
- **Gnosis** is a registered chain, also since 2026-08-19 (RFC-0030).
- **IPFS resolution** shipped in v2.6.0 (RFC-0037), with every document verified against its CID.

The GRC's Stage 3 paragraph ("nuthatch cannot index the V1 DataEdge ... Nor does it resolve IPFS",
verified at `1185c4d`) is stale for the same reason and wants correcting.

## What I measured

All on 2026-09-13.

**The publisher is alive.** DataEdge `0x5b4293b4c0f36cb5d4448950830bc777759b6c4f` on Gnosis, submitter
`0x8cbbe43f97f80efa6ba0a95f3d544e03f84db0ce`, two transactions per five-minute bucket, the newest at
15:45 UTC. The calldata is ABI-encoded JSON, `{"topic": ..., "hash": <CID>, "timestamp": <bucket>}`.

**Two topics are posted per bucket.** `gateway_indexer_attempt_qos_5_minutes_prod_v3` is one row per
indexer, deployment, chain and gateway, and carries every field the old chart read.
`gateway_query_result_qos_5_minutes_prod_v3` is per deployment from the gateway's side, and the
served-vs-allocated gap needs it for each deployment's query total.

**The payloads are fetchable at every age I tried**, from `ipfs.network.thegraph.com`:

| Bucket | Topic | Bytes | Rows | Fetch |
|---|---|---:|---:|---:|
| 2026-09-12 15:35 | indexer attempt | 1,707,346 | 2,526 | 1.0 s |
| 2026-07-14 07:50 | indexer attempt | 1,716,149 | 2,538 | 1.3 s |
| 2026-06-13 14:15 | indexer attempt | 1,941,815 | 2,872 | 1.3 s |
| 2026-06-13 14:15 | query result | 642,553 | 1,234 | 1.3 s |

Pinata served the same documents. `ipfs.io` answered 504 on two of three and `dweb.link` timed out
on all of them. Foghorn's `dataedge.rs` says historical CIDs are unreachable ("no providers found"):
true of the gateways it tried, not true of The Graph's endpoint. That comment wants correcting too.

**The indexer-attempt fields**, from a live payload:

```
indexer_wallet  indexer_url  subgraph_deployment_ipfs_hash  chain  gateway_id
start_epoch  end_epoch
query_count  num_indexer_200_responses  proportion_indexer_200_responses
avg_indexer_latency_ms  max_indexer_latency_ms  stdev_indexer_latency_ms
avg_indexer_blocks_behind  max_indexer_blocks_behind
avg_query_fee  max_query_fee  total_query_fees
```

**Parity includes their holes.** The publisher stopped for about 38 hours from 2026-07-29 and for 37
hours or more from 2026-08-04, and resumed from the tip without backfilling (GRC, Motivation). Those
buckets do not exist anywhere. The rebuilt chart shows them as gaps.

## What the old section rendered

The bar for "back" is everything below, read from `cb61cea~1` and `cd47802~1`. Each row names where
it comes from now and what changes.

| Element | Old source and arithmetic | Now |
|---|---|---|
| Query Performance, **Query Count** | oracle `query_count` per day; summary = 90-day total | same field, summed per allocation first |
| **Query Fees** | `total_query_fees` per day; summary = total | same |
| **Avg. Query Fee** | fees over queries per day; summary = the **latest day only** | same series; summary over the window, latest day shown beside it |
| **Query Success Rate** | query-weighted per day (the subgraph weights it); summary = mean of daily means | same per day; summary query-weighted over the window; bad buckets and the worst bucket beside it |
| **Avg. Indexer Latency** | query-weighted per day; summary = mean of daily means | same per day; summary query-weighted; Foghorn p50/p95/p99 beside it |
| **Avg. Blocks Behind** | query-weighted blocks, across chains; summary = mean of daily means | seconds behind the freshest peer on the same deployment, as the old quality panel already did |
| Provenance link to `/qos`, "90 day window" footer, skeleton, empty state | static | kept; empty state distinguishes "no data" from "publisher silent" |
| **QoS Quality**, grade A to F | `q_score` from `indexer_qos_score` (Postgres, cron); `qosGrade` thresholds 75/60/45/30 | kittiwake computes it from the nest rollup; same thresholds |
| Four bars: Reliability (Wilson), Latency (cohort-normalised decay), Freshness, Coverage | `lib/qos-score.ts`, `lib/qos-aggregate.ts` over `qos_daily` | ported to Rust, same `DEFAULTS`, tested against the TypeScript on fixtures |
| **Served-vs-allocated gap** | allocation share minus served-query share, mean over allocated deployments | allocations from `graph-allocations-nest`, served share from the QoS nest |
| **Q-score history** | daily `q_score`, EWMA half-life 10 days | same, recomputed for the whole backfill rather than "history builds daily" |
| **What is holding the score down** | `qos-deployments` route: per deployment success rate, dominant deficit, cohort-struggling marker | same, at the same grain |
| Directory **QoS** column | `/api/network-health` leaderboard | `q_score` on kittiwake's `/api/indexers-enriched` |
| Daily Trends: Rewards (indexer and delegator, stacked), Query Fees (collected, curators), Cumulative tabs | Horizon Performance subgraph, 30 days | `graph-allocations-nest` view, fees labelled gross or net |

## 1. Daily Trends

**What it showed.** The community Horizon Performance subgraph's `rewardDailyAggs` and
`queryFeeDailyAggs`, up to 90 days: indexer and delegator rewards stacked, query fees collected with
the curators' share, and cumulative rewards.

**Where it comes from now.** `graph-allocations-nest` already declares `IndexingRewardsCollected`
(Horizon, which states the indexer and delegator split itself), legacy `RewardsAssigned` (the split
derived from the cut in force, as `50-lodestar-epochs.sql` already does), and `QueryFeesCollected`
(`tokensCollected`, `tokensCurators`), with `block_timestamps = true`.

**The design.**

- A view, `views/96-lodestar-indexer-daily.sql`: one row per indexer per UTC day with indexer
  rewards, delegator rewards, fees gross, the curators' share, the protocol cut, fees net, and the
  event counts.
- A kittiwake route, `GET /api/indexer/{address}/trends?days=30` (1 to 90), answering the old
  `IndexerTrendsResponse` shape, so the chart comes back from `cd47802^` nearly unchanged.

**Better than parity.** Fees are labelled gross or net. The nest's own views established that the
network subgraph's `queryFeesCollected` is net, and that gross reads 12.2% high on every deployment's
30-day fees (`40-lodestar-allocations.sql`). The old chart never said which it was showing.

## 2. Query Performance: Edge & Node's feed

**What it showed.** `api/indexer-qos/[address]` read Ellipfra's fork of the oracle subgraph for 90
days of `indexerDailyDataPoints`, collapsed each day across gateways and chains, and drew success
rate, latency, blocks behind, query volume and fees.

**The nest.** `qos-reo-nest` already exists and says it is blocked on source capability. It is not,
apart from slice N1:

```toml
[nest]
name = "qos-reo-nest"
chain = "gnosis"

[[contracts]]
alias = "data_edge"
address = "0x5b4293b4c0f36cb5d4448950830bc777759b6c4f"
start_block = 24747400          # the oracle subgraph's own; see Decisions needed, 3
abi = "abis/data-edge.json"     # submitQoSPayload(bytes)
events = []

[extract]
top_level_calls = true

[[ipfs]]
name = "qos_payload"
on = "data_edge__call_submit_qo_s_payload"   # illustrative; the real name comes from the decoder
cid_column = "_payload"
cid_json_path = "hash"                       # does not exist yet: slice N1
```

**Slice N1, in nuthatch.** `cid_from_value` accepts a string, or bytes of exactly 32. `_payload` is
about 150 bytes of JSON, so today the resolver skips every row without saying so. The proposal is
an optional `cid_json_path` on `[[ipfs]]`. When it is set, the column value (a string, or bytes that
are valid UTF-8) is parsed as JSON. An object yields the value at the path, an array yields one per
element, and anything unparseable yields no row and increments a counter. A topic filter belongs in
the same slice, so each declaration takes one topic. This nest declares two: the indexer-attempt
documents for the charts, and the query-result documents for the served-vs-allocated gap. This is an
RFC-0037 slice and is filed there, not built here.

**Who counts as the publisher.** The oracle subgraph accepts messages only from a submitter
allowlist. The canonical deployment's allowlist went stale on 2026-07-01 and rejected every message
for a month while reporting itself healthy (GRC, Motivation). The nest therefore keeps every call. The
view filters by a publisher list written in the SQL, and counts rejected rows rather than dropping
them.

**The rollup.** An authored entity (RFC-0041), `qos_allocation_daily`, keyed by indexer,
deployment, chain, gateway and day, because the QoS Quality score and its per-deployment breakdown
need that grain. The indexer-day figures on the charts are sums over it, never averages of it:

| Column | Arithmetic |
|---|---|
| `query_count` | sum of `query_count` |
| `success_rate` | sum of `num_indexer_200_responses` over sum of `query_count` |
| `latency_ms` | mean of `avg_indexer_latency_ms` weighted by `query_count` |
| `blocks_behind` | mean of `avg_indexer_blocks_behind` weighted by `query_count`, and seconds behind via the chain's block time |
| `bad_buckets` | buckets with at least 50 queries and under 90% success |
| `worst_bucket` | the lowest-success bucket with at least 50 queries: its time, success and volume |
| `total_query_fees` | sum; `avg_query_fee` is that over `query_count` |
| `buckets` | distinct buckets seen, out of 288 |

Latency is weighted by queries, not by successful responses as Foghorn weights its own. The oracle's
average behaves as if it includes failed responses: weighting it by 200s moved latency by more than
20% on 99 of 374 indexer-days, all of them days with many fast failures. The first draft's
unweighted mean of bucket means for blocks behind is wrong: it misses the old figure by up to 18.4M
blocks, because a deployment with 5 queries and 206.8M blocks behind counts as much as a busy one.

## What was wrong with the old section

Measured on 2026-09-13 over 2026-09-06 to 2026-09-12: 2,014 indexer-attempt payloads, 4,800,241 rows,
56 indexers, the old pipeline rebuilt from the reference subgraph mapping and `cb61cea~1`. Parity
against the subgraph itself is pending: production read Ellipfra's fork, whose mapping may differ.

- **The daily series were right.** Daily success rate matches to 2e-9 pp on all 388 indexer-days, and
  fees match exactly. The first draft of this RFC said the old route averaged unweighted; with one
  gateway per row, it did not matter.
- **The headline figures were not.** Each was a plain mean of daily figures. Against the
  query-weighted window, success rate was off by more than 1 pp for 22 of 56 indexers and by more
  than 5 pp for 13. staked.cloud showed 62.7% against 83.4%; nodeify.eth 56.4% against 69.8%.
- **A day hid its outages.** Ellipfra read 97.36% for the week, and the bucket ending 09-08 14:05
  served 0 of 52,286 queries. tehn-r.eth had 474 buckets under 90% success with at least 50 queries,
  worst 0 of 5,997; suntzu had 1,209. None of that was visible.
- **Blocks behind in blocks meant nothing.** It adds chains with block times 48 times apart. One
  arbitrum-sepolia deployment 306M blocks behind puts 0x0a015d9e at 1.59M for the week.
- **"Avg. Query Fee" showed the latest day only.**

**Kittiwake.** `GET /api/indexer/{address}/qos?days=90` answers the old `{ qos: IndexerQoSPoint[] }`
plus `buckets` and `gatewayId`. Its freshness is the publisher's newest post against the nest's
newest bucket. Those are different questions, and conflating them is how the 2026-07 outage hid
(GRC, anti-silent-failure 1 and 2).

**The page.** `IndexerQoSChart` comes back from `cb61cea^`. Its tooltip already says these are Edge &
Node's figures, counted from traffic their gateway routed.

**The QoS Quality panel.** `QosQualityPanel` comes back from `cb61cea^` against two kittiwake routes
in the old shapes, `/api/indexer/{address}/qos-score` and `/api/indexer/{address}/qos-deployments`.
The scoring is `lib/qos-score.ts` and `lib/qos-aggregate.ts` ported to a kittiwake crate. Those files
are pure functions with their own tests and a calibration history in their comments, so the port
keeps `DEFAULTS` as they were and is checked against the TypeScript on the same fixtures before
anything new is tried. Block times per chain come across with it. Allocations for the served gap
come from `graph-allocations-nest`, which kittiwake already reads. Two things are better than before:
the score history covers the whole backfill instead of starting when a cron first ran, and every
input is a nest row anyone can re-derive.

## 3. Query Performance: Foghorn's series

Foghorn stores `foghorn_qos` under the oracle's own column names with its own `gateway_id`, in
five-minute buckets, and rolls it up daily in `foghorn-api/src/qos.rs`. Kittiwake proxies
`/api/foghorn/{*path}`, and `src/lib/foghorn.ts` already has fetchers for it.

It goes on the same four charts as a second line labelled as probes, plus a fifth chart for
`correctness_rate` and p50/p95/p99 latency on the latency chart. Two captions are required rather
than optional. Foghorn's `query_count` is probes dispatched, never demand. And a third of its probes
are paid direct (2,932 of 8,840 over the week); the rest go through the gateway and are an upper
bound (Foghorn migration 021).

What it adds is measured. It disagrees with the oracle by 10 points or more on 7 of 58 comparable
indexer-deployment pairs: nodeify at 69.8% on the oracle and 15.1% over 166 probes. It found 27
attestation conflicts with genuinely different data across 3 deployments. Two limits are measured too.
It covers 127 indexer-deployment pairs against the oracle's 5,401. In the last day indexers refused
2,297 paid probes because they denylist our payer, against 397 served. And
`/v1/indexer/:address/quality` returns `total_probes: 0` and null latency for every indexer while its
own `by_deployment` lists hundreds of probes, which is slice F1.

This series is Foghorn's, not a nest's. Moving it onto nuthatch is the GRC's Stages 2 and 3 (a
publisher contract emitting events on Arbitrum, and a nest over it), which are not built and are out
of scope here.

## Goals

1. Both charts render on the indexer page with `GRAPH_API_KEY` unset.
2. Every Edge & Node and on-chain figure on them can be reproduced by running the two nests.
3. Parity is recorded per chart on its PR, by the method in Slices.
4. A bucket or day with no data renders as a gap, never as zero.

## Non-goals

- Producing organic demand ourselves. Nobody who did not serve those queries can.
- Publishing Foghorn's figures on chain (the GRC).
- The P&L panel's own daily series. See Open questions.

## Slices

| | Repo | Slice | Needs |
|---|---|---|---|
| T1 | `graph-allocations-nest` | the daily view | - |
| T2 | kittiwake | `/api/indexer/{address}/trends`, with a `kittiwake-parity` entry | T1 |
| T3 | lodestar | `IndexerTrendsChart` restored | T2 |
| N1 | nuthatch | `[[ipfs]] cid_json_path` and the topic filter | - |
| Q1 | `qos-reo-nest` | the nest, the publisher filter, `qos_allocation_daily` | N1 |
| Q2 | kittiwake | `/api/indexer/{address}/qos` | Q1 |
| Q3 | lodestar | `IndexerQoSChart` restored, with gaps | Q2 |
| Q4 | lodestar | the Foghorn series | Q3, F1 |
| F1 | foghorn | `/quality` counts every dispatched probe; scorecard and buckets agree on the same window | - |
| S1 | kittiwake | the score port, `qos-score` and `qos-deployments` routes, `q_score` on `indexers-enriched` | Q1 |
| S2 | lodestar | `QosQualityPanel` and the directory column restored | S1 |
| B1 | lodestar | the release blog post in `src/content/blog/`: what each figure is, and how it differs from the old gateway-queried ones | everything above |

Nothing is deployed until parity is signed off and B1 is ready to publish with it. Progress,
measurements and findings are recorded as they happen in
[performance-charts-log.md](performance-charts-log.md).

The T slices and N1 can start today, in parallel.

**Parity method.** T1 against the Horizon Performance subgraph, and Q1 against Ellipfra's fork: five
indexers, per day, over the same window. Both run once, from a machine holding a key and outside
Lodestar, and are recorded on the PR. Q1 is compared twice. It is compared first with the old
unweighted arithmetic, where it should match exactly, and then published weighted.

## Decisions needed

1. **IPFS in nuthatch, against #1160's line.** #1160, under group B, says "Nuthatch never touches IPFS;
   Lodestar may." This RFC resolves IPFS in the nest. I recommend the nest. RFC-0037 is accepted and
   shipped, and verification against the CID is what makes the numbers reproducible by a third
   party. The alternative is kittiwake fetching the CIDs into Postgres, which works and which nobody
   else can check.
2. **How much to keep.** Measured over a week: indexer-attempt documents are 394 MB gzipped and
   query-result 173 MB; one day is 494 MB raw, 59.5 MB gzip, 26.0 MB as zstd parquet. Extrapolated to
   90 days: about 44 GB raw, 5.1 GB gzip, 2.3 GB parquet. Compressed, keeping every document is cheap,
   and I recommend it.
3. **How far back.** Either the old chart's 90 days, from 2026-06, or everything from block
   24,747,400.

## Open questions

- Does a top-level call row carry the transaction sender? The publisher filter needs it. Check before
  Q1.
- Does a CID that misses the 64-fetch window budget get another attempt in a later window? If not, a
  90-day backfill of about 26,000 documents needs RFC-0037's out-of-band worker first.
- The P&L panel dates indexing rewards by allocation `closed_at` from Postgres. The trends view dates
  them by the collection event, and Horizon can collect on an open allocation. Two daily rewards
  series on one page that disagree on a given day would be a trap. I have not measured how often
  they differ; T1's parity run should include that comparison.
