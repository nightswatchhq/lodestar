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
