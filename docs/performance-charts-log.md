# Performance charts: running log

The working record for [the RFC](rfc-the-performance-charts-come-back.md). Newest entries at the
bottom. Every PR, measurement and finding lands here when it happens, so the release blog post can
be written from this file rather than from memory.

**Release gates:** parity with the old key-based figures signed off; every element in the RFC's
inventory table present; the blog post (`src/content/blog/`) published with the release. Nothing is
deployed before all three.

## 2026-09-13

**Why this exists.** stake-machine asked in the Night's Watch Discord whether the performance charts
had been removed from the indexer page. They had, on 2026-09-05 under nuthatch#1160: `cb61cea`
removed Query Performance and the QoS Quality panel, `cd47802` removed Daily Trends. Both read
subgraphs through the gateway with `GRAPH_API_KEY`. We said they will be back.

**RFC opened.** lodestar#228. Amended the same day after reading everything the old section
rendered: the QoS Quality panel and the directory QoS column were missing from the first draft and
are now in scope (slices S1, S2).

**Measured before designing.**
- Edge & Node's QoS publisher is live: DataEdge `0x5b4293b4c0f36cb5d4448950830bc777759b6c4f` on
  Gnosis, two posts per five-minute bucket, newest seen 15:45 UTC.
- Payloads fetch from `ipfs.network.thegraph.com` at 1, 7, 30, 60 and 90 days old, about 1 s each.
  Indexer-attempt documents are 1.7 to 1.9 MB and 2,500 to 2,900 rows per bucket. Foghorn's
  `dataedge.rs` comment saying historical CIDs are unreachable is out of date.
- nuthatch had `top_level_calls`, Gnosis and IPFS resolution since 2026-08-19, so #1160's "not
  indexable by design" was stale. The real gap: `[[ipfs]]` cannot read a CID inside JSON calldata
  (`cid_from_value` takes a string or exactly 32 bytes).

**Found in the old QoS arithmetic.** Success rate, latency and blocks behind were unweighted means
across rows, so an allocation with 3 queries counted as much as one with 300,000. Headline figures
were means of daily means. "Avg. Query Fee" showed the latest day only.

**Daily Trends slices T1 to T3, open, not merged.**
- graph-allocations-nest#23: `lodestar_indexer_daily`. Over all history the view's rewards and gross
  fees equal the raw event sums exactly (184,138,350.97 and 10,449,131.59 GRT). Checked against a
  local nest ending 2026-08-22, not production. Legacy `RewardsAssigned` untested locally (no rows).
- kittiwake#140: `GET /api/indexer/{address}/trends`, old shape plus `totalCollectedNet` and
  `totalProtocolTax`. Tests pass; not run against a real nest.
- lodestar#229: chart restored, all tabs, legends, tooltips and empty states carried over; errors
  shown as errors; fees labelled gross with a net bar. Held: a lodestar merge deploys to production.
  Its regenerated route list drops six scuttlebutt routes production still serves; fix before merge.
- Parity against the Horizon Performance subgraph: pending, needs the key.

**Found: the P&L panel undercounts rewards.** It dates indexing rewards by allocation close. For
`0xf92f…a6d4` over 30 days to 2026-08-22 that is 2,854,274 GRT against 6,207,611 collected, about
54% low; four other indexers matched to the GRT. Live bug, outside these slices, not yet fixed.

**In progress.** N1 (nuthatch `[[ipfs]]` CID from JSON), the week-long payload measurement (old
pipeline vs new rollup vs Foghorn), and the S1 scoring port to kittiwake.

**Blocked on Chief.** The Graph API key for parity cannot be stored by the tooling as things stand;
merges are Chief's.

**Measurement: the old QoS section against raw payloads.** Window 2026-09-06 to 2026-09-12 UTC:
2,014 indexer-attempt and 2,011 query-result payloads, 4,800,241 rows, 56 indexers, 388
indexer-days. Old pipeline rebuilt from the reference subgraph mapping and `cb61cea~1`; production
read Ellipfra's fork, not seen, so subgraph-side parity stays pending.
- The RFC was wrong twice and is corrected. Daily success rate was already query-weighted: old and
  rebuilt agree to 2.0e-9 pp on all 388 indexer-days, fees exactly. The unweighted mean of bucket
  means for blocks behind misses by up to 18,451,669 blocks; query-weighted matches to 2.8e-8.
- Latency weighted by 200s instead of queries moves more than 20% on 99 of 374 indexer-days, all
  heavy-fast-failure days, so the oracle average appears to include failures. Query-weighted kept.
- Headline figures were means of daily means: success rate off by more than 1 pp for 22 of 56
  indexers and more than 5 pp for 13. staked.cloud 62.7% shown against 83.4%; 0x6f9bb7e4 72.4%
  against 55.5%; nodeify.eth 56.4% against 69.8%; waynewayner.de 78.6% against 67.7%.
- Daily grain hid outages. Ellipfra 97.36% for the week, bucket ending 09-08 14:05 served 0 of
  52,286. Buckets with at least 50 queries under 90% success: suntzu 1,209, nodeify 1,656, p2p-org
  827, tehn-r 474 (worst 0 of 5,997), pinax 13.
- Blocks behind across chains is meaningless: one arbitrum-sepolia deployment 306M blocks behind puts
  0x0a015d9e at 1.59M for the week. The rebuilt card shows seconds behind the freshest peer.
- QoS Quality reproduced on 7 days (panel used 30 with EWMA): ellipfra 65.1 B, pinax 69.3 B,
  0x8bbe94c2 79.1 A, 0x17def1a4 33.2 D, 0x605d0b92 5.3 F, nodeify 36.6 D, waynewayner.de 25.2 F,
  0x0a015d9e 71.3 B with a served gap of 0.59 that would flag. The served gap needs the query-result
  topic, so the nest declares both.
- Publisher coverage: 2,014 of 2,016 indexer-attempt buckets posted (missing 09-09 19:05 and 09-11
  22:25), 2,011 of 2,016 query-result. Post lag 1,815 to 1,860 s. The reference mapping's allowlist
  (`0x0b8cef00…`) would reject the live publisher (`0x8cbbe43f…`).
- Storage, measured: 7 days is 394 MB gzip indexer-attempt plus 173 MB query-result; one day 494 MB
  raw, 26.0 MB zstd parquet. Extrapolated 90 days: 44 GB raw, 5.1 GB gzip, 2.3 GB parquet. Keep
  everything.

**Foghorn against the oracle, same week, through kittiwake's proxy.** 127 indexer-deployment pairs
probed against the oracle's 5,401, 112 overlapping. Mean absolute success-rate difference 0.064; 7 of
58 comparable pairs differ by 10 points or more: nodeify 69.8% oracle against 15.1% over 166 probes,
suntzu 89.7% against 26.3% over 19. 27 of 500 returned attestation conflicts carry genuinely
different data across 3 deployments (the limit was hit, so more). 33% of probes paid direct (2,932),
67% via gateway. Last 24 h: 397 paid probes served, 2,297 refused because indexers denylist our payer.

**Found: two Foghorn defects.** `/v1/indexer/:address/quality` returns `total_probes: 0` and null
latencies for every indexer while `by_deployment` lists hundreds of probes; the scorecard (820 probes,
21 divergent) and the buckets (637, 10) disagree for the same indexer and window. Slice F1.

**S1, first half: the scoring ported to kittiwake.** kittiwake#141, crate `kittiwake-qos`, open, not
merged. Every constant carried unchanged (`DEFAULTS`, block times, grade thresholds 75/60/45/30,
cohort constants, `LATENCY_TAU_MULT`), every scoring function, aggregation, the served gap. 45 unit
tests (every vitest case from both old files plus the nest adapter). Equivalence against the original
TypeScript run under Node: 689 seeded cases, all equal, max deviation 1.16e-10; two deliberate
mutations each failed it. Only NaN handling differs (`f64::max` vs `Math.max`), unreachable from real
input. Routes and database reads are the second half. Its adapter first summed indexer attempts for
each deployment's query total, which undercounts where the gateway retried on a second indexer.
Changed in `cf64f51`: totals come from `qos_deployment_daily` (the query-result topic's
`query_count`), no attempt-based fallback. A retried-query test covers it (1,100 attempts against
1,000 gateway queries). 46 unit tests; all 689 equivalence cases still pass, max deviation 1.16e-10.

**Decision: fix the P&L undercount now (Chief).** Cause: kittiwake `revenue_daily` and
`revenue_by_deployment` (`crates/db/src/lib.rs`) take indexing rewards from `allocations` with
`closed_at IS NOT NULL`, dated by close, so rewards collected on open allocations are misdated or
missing. Fix in progress: rewards by collection event from `graph-allocations-nest` at deployment
grain, one definition for `/revenue`, `/pnl` and Daily Trends. The fee side (`rav_redemptions`
against `QueryFeesCollected`) is being checked to the same standard, and production error is being
measured read-only.
