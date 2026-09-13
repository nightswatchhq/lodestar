# Performance charts: running log

The working record for [the RFC](rfc-the-performance-charts-come-back.md). Newest entries at the
bottom. Every PR, measurement and finding lands here when it happens, so the release blog post can
be written from this file rather than from memory.

**Release gates:** parity with the old key-based figures signed off; every element in the RFC's
inventory table present; the blog post (`src/content/blog/`) ready to publish with the release; and
Chief's yes, asked for once everything is built and verified. On that yes: merge everything, deploy
in order (nuthatch, nests, kittiwake, lodestar last), then publish the blog post. Nothing is merged
or deployed before then.

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

**N1: `[[ipfs]]` reads a CID inside JSON calldata.** nuthatch#1367 (`0c436d9e`, `f1b3ee70`), open.
New keys `cid_json_path` and `json_match`, entering the declaration hash only when set. Three faults
fixed on the way, each alone enough to resolve nothing: resolution ran before call decode and saw only
event rows; the call filter used the `eth_getLogs` address list, which omits an event-less contract;
unreadable rows left no trace (now `nuthatch_nest_ipfs_unreadable_total`). Five tests, seven
mutations each caught; 1,185 lib tests pass. Live on Gnosis, blocks 48,231,452 to 48,232,456: 36
calls, 36 documents resolved (18 per topic), 37.8 MB, about 1.2 s each, 0 unreadable.

**Found by N1, and each blocks "perfect":**
- 0 of 36 documents verified. Every payload is 0.53 to 1.68 MB, over the 256 KiB single-block
  verification limit, so each is stored `verified = false`. RFC-0037's reproducibility argument does
  not yet hold for these. Slice N2.
- A CID that misses the 64-fetch window budget, or whose gateways fail, is never retried
  (`src/indexer.rs:5519` promises an out-of-band resolver that does not exist). At Gnosis's default
  20,000-block window about 678 CIDs arrive per window and 64 resolve: over 90% of a backfill lost
  permanently. Slice N3.
- Top-level call rows carry no sender (`src/calldata.rs:316`), so the publisher filter cannot be
  written. Slice N3.
- `--seal-direct` never decodes top-level calls or resolves IPFS: a backfill run that way produces
  nothing and says nothing (read from code, not run). Slice N3.
- The runtime identity guard and `/sql` provenance hash use the event registry only; for an
  event-less nest that is `e3b0c442…`, the hash of nothing. Predates N1. Slice N3.

**F1: Foghorn's quality counts.** foghorn#3 (`92b58dd`), open. Causes:
- `/quality` matched `observation.indexer_address` directly (`routes.rs:269`), which for a gateway
  probe holds the allocation signing key, so only paid observations matched; those are mostly
  payment refusals with no response hash, filtered to 0. `by_deployment` counted the refusals.
  `divergent_probes` used `cluster_count > 1`, counting a probe as a fault even when this indexer
  was in the majority.
- Scorecard 820 against buckets 637: the rollup window started at `NOW() - interval`, not on a
  bucket boundary (`qos.rs:125`), so each pass rewrote the oldest bucket from a partial slice.
- Scorecard 21 divergent against buckets 10: the rollup compared answers with the stake-largest
  hash but checked the count-largest cluster's size (`qos.rs:93-97`, `169-178`). A bug, not two
  definitions.
Fixed with one shared probe query resolving identity through `allocation_map`, a bucket-aligned
window, and a strict count majority matching the scorer. Three tests fail before the fix (0 vs 4, 1
vs 2, 2 vs 1). Untested against production data.

**Consequence for the RFC.** The Foghorn figures in §3 (7 of 58 pairs differing by 10 points or
more, 27 attestation conflicts, 0.064 mean difference) came from the faulty endpoints. They are
re-measured after F1 is deployed and its buckets re-rolled.

**F1 residuals, being fixed on the same PR.** `deployment_quality` carries the same faults; late
attribution (`resolver.rs:136`, retried after 24 h) and a deployment flagged non-deterministic after
rollup never re-roll their buckets; the new database tests pass silently when
`FOGHORN_TEST_DATABASE_URL` is unset.

**The P&L reads the right money.** Open, held: graph-allocations-nest#23 (`9d41ab2`, adds
`lodestar_indexer_deployment_daily`; `lodestar_indexer_daily` is now its sum), kittiwake#142
(`bf332b2`, `/revenue`, `/revenue?byDeployment=1` and `/pnl` read those views; the Postgres queries
are deleted), lodestar#230 (`d70942d`, the panel says "received"). Follow-ups: kittiwake#140
(`4d285bf`) and lodestar#229 (`84fd14d`) say net is after the delegators' cut too.
Deploy order: #23, then #142, then lodestar#230 the same day.

Causes, confirmed at `crates/db/src/lib.rs:855` and `:887`:
- Rewards dated by `allocations.closed_at` with `closed_at IS NOT NULL`, so rewards collected on
  open allocations were misdated or missing.
- The rewards figure included the delegators' share, and fees were gross.
- Postgres `allocations` lags by days: the ingest pages 2,000 an hour through ~245,000.

A double count in the first #23 was caught and fixed: `HorizonRewardsAssigned` fires in the same
transaction as `IndexingRewardsCollected` on every Horizon allocation (235,408 of 235,408 pairs on
production), so the view takes it only for legacy allocations.

Fees: `rav_redemptions` is the same gross money as `QueryFeesCollected`, matching to the cent for
five indexers. Received is gross less the 1% protocol cut (rounded up), the curators' share, and the
delegators' cut where the pool has shares. The formula matched the chain's own payment records for
1,990 production collections across 131 transactions, wei for wei. The earlier views rounded the cut
down and ignored the delegators' cut.

Production error, live P&L at 16:41Z against what each indexer received over the same 30 days:
`0xf92f…a6d4` +11.3%, `0x8bbe…f699` -49.8%, `0x2f09…e1ce` +98.8%, `0x090f…ed3` -18.5%,
`0xe9e2…cf59` +259.4%. Network-wide, 30 days to 2026-09-13: 54 of 58 paid indexers off by more than
1 GRT, 7,196,820 GRT of absolute error; 24,122,578 GRT of rewards collected, 15,651,359 booked by
close-dating; 16 indexers collected 5,096,669 GRT on still-open allocations across 5,959 collections.

Response meaning changes, field names kept: `rav_grt` and `indexing_rewards_grt` now mean received;
gross stays as `query_fees_gross_grt` and `indexing_rewards_gross_grt`; windows start at UTC
midnight; 75 network-wide fee collections for data services other than SubgraphService drop out.

Other readers (`recommend.rs`, `score`, `refresh.rs`) use lifetime nest totals, not close-dated rows,
so not this fault; their lifetime `query_fees_collected` still includes the delegators' share, a
different definition, listed not changed. Nothing reads `rav_redemptions` any more.

Untested: the new views, sums check and speed on the production nest (the public SQL parser refuses
`ASOF`, so the receipt check ran as equivalent SQL; that refusal applies to ad-hoc SQL only, since
`views/90-lodestar-indexers.sql` and `views/50-lodestar-epochs.sql` already use `ASOF JOIN` and are
served in production today);

**Q1: the QoS nest.** qos-reo-nest#1 (`5cf77dc`, `79ced0a`, `d0bc6df`), open. Gnosis, `data_edge` from
block 46,700,000 (2026-06-14 23:15 UTC), `top_level_calls`, two `[[ipfs]]` declarations with
`cid_json_path` and `json_match`. Views: typed five-minute rows (day is the bucket start's UTC day;
a bucket posted twice counts once), `qos_allocation_daily`, `qos_deployment_daily`,
`qos_indexer_daily` (sums of allocation rows), seconds behind the freshest credible peer using
kittiwake#141's block-time table, and `qos_settings.require_verified` ready for N2.

Parity, blocks 48,119,000 to 48,136,546 in 544 s (596 calls, 260 MB hot, 53 MB sealed): 575 of 576
documents for 2026-09-07 resolved; the 287 indexer-topic documents are byte-identical to the
measurement's independently fetched copies; on those 287 all 56 indexers match the independent
reference exactly for counts, buckets, bad buckets and worst bucket, and within 1.1e-14 relative for
rates and fees. `checks/parity-2026-09-07.sql` covers all 288 and passes on the full set.

**Found by Q1:**
- The committed check fails on the real run because one document (`QmYTFzn…`, 00:10) failed with
  "reading response body" and was never retried; that one bucket shifts 49 of 56 indexers. Sent to N3.
- One day of `qos_indexer_daily` is refused under the default 512 MB analytics budget; at 8 GB it
  takes 0.97 s and 3.86 GB peak. Recomputing from JSON per query cannot serve 90 days. Entities
  cannot host the parsing (`from_json`, `unnest`, window functions, `arg_min`). Decision: nuthatch
  slice N4, typed rows from JSON documents at resolution, so the rollups become authored incremental
  entities over typed columns. Queued behind N2 and N3, which touch the same code.
- `blocks = true` is set only for its 800-block window cap: without it the event-less nest's
  adaptive window grew to 4,000 blocks and hit the fetch budget 53 times over 17,500 blocks. A
  workaround, to be removed once N3's resolver lands; sent to N3 to prove.
- The publisher filter is written and tested on a stub (`pending/publisher-filter.sql`), including
  a stranger re-posting a published CID; it waits for N3's `from` column.

**F1 residuals done.** foghorn#3 (`e96d48d`, `9d8873b`), open.
- `deployment_quality` grouped by raw signing key, counted refused payments and marked any
  corroborated probe divergent; now on the shared `JUDGED_PROBES` definition. Test failed before
  (rows keyed by signing keys).
- Late changes to a bucket's contents: migration 024 adds `qos_reroll`; the resolver's
  `record_attribution` and `detect_nondeterministic` request re-rolls; the rollup drains them.
  Two tests failed before (4 against 5 queries; 4 against 0 divergent).
- Foghorn had no CI. Added one running the database tests against `postgres:16-alpine`; a CI run
  without the database URL now fails instead of skipping. CI run 34770364937: probe 33 passed and 1
  ignored, core 28, API 2, all 9 database tests executed.
- Found on the way: `sqlx::migrate!` embeds migrations at compile time without cargo knowing, so a
  cached build kept the old schema; fixed with `build.rs` `rerun-if-changed`.
- Operator step after deploy: `docker compose run --rm probe foghorn-probe reroll-qos`, idempotent,
  tested, not run on real data.

**Still open on F1, sent back:** `detect_nondeterministic` keeps `cluster_count > 1` without
excluding refusals or unattributed keys, so a deployment can be excused from correctness on evidence
the rest of Foghorn rejects; unflagging has no test; the re-roll leaves stale rows it would not
write (old signing-key rows, empty buckets).

**F1 complete.** foghorn#3 (`e598f13`), open.
- `detect_nondeterministic` counted an unattributed signing key as a minority indexer and any
  `cluster_count > 1` probe as divergent, so a deployment could be flagged, and excused from
  correctness, on evidence the rest of Foghorn rejects. Now on `judged_probes(since,
  excuse_nondeterministic)` in `foghorn-core/src/judged.rs`, the single definition for the API and the
  detector; flagging uses `excuse_nondeterministic = false`, or a flagged deployment would stop
  producing the evidence that keeps it flagged. Test failed before (flagged the unattributed
  deployment too), passes after with the rotating-minority control still flagged.
- Unflagging tested; a mutation that re-rolls only on newly flagged deployments fails it (0 against 1).
- `roll_range` only upserted; a `stale` CTE now deletes rows in range that the aggregate would not
  produce (signing-key rows, empty buckets), keeping other `bucket_secs` series. Test failed before.
- Local with Postgres 15: probe 36 passed and 1 ignored, API 2, core 28.
Untested: production flag rates will shift because the detector's denominator now counts only judged
probes; not measured. Re-measure after deploy alongside the §3 figures. legacy branches on real data; fees before
exponential rebates (left NULL); kittiwake end to end against a live nest.
