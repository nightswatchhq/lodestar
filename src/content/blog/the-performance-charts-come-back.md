---
title: "The Performance Charts Are Back, and Now They Add Up"
date: "2026-09-TODO"
author: "cargopete"
tags: ["lodestar", "nuthatch", "foghorn", "the-graph", "qos", "indexers", "gnosis", "ipfs", "horizon"]
category: "Infrastructure"
excerpt: "When Lodestar stopped using a Graph API key on 5 September, the indexer page lost Query Performance, QoS Quality and Daily Trends. An indexer asked where they had gone. They are back, read from the same Edge & Node oracle data through a nest anyone can run, and rebuilding them turned up several things the old charts had been getting quietly wrong. Here is what each figure is now, how it differs from before, and how we checked."
---

*On **5 September** Lodestar stopped holding a Graph API key, and three things on the indexer page went with it: the Query Performance chart, the QoS Quality panel and Daily Trends. We said so in [the post that week](/blog/lodestar-reads-no-subgraphs), and eight days later an indexer asked in the Night's Watch Discord, entirely reasonably, where their charts had gone. This is the answer. They are back, they read the same underlying data as before without anyone's key, and in rebuilding them we measured the old ones properly for the first time. Some of what we found is flattering to nobody, least of all us.*

---

## What went, and why

Two commits removed them. `cb61cea` took out Query Performance and QoS Quality, which read Edge & Node's QoS oracle subgraph (in practice Ellipfra's fork of it, which stayed current after the original stalled). `cd47802` took out Daily Trends, which read a community Horizon performance subgraph. Both went through the gateway with a key, and the rule we set on 5 September was that anything which could not exist without one would be removed rather than kept on an exception.

At the time we recorded the QoS oracle as "not indexable by nuthatch by design", because the oracle posts through a contract call rather than an event. That was already wrong on the day: nuthatch had learned to decode top-level calls on 19 August. It is the sort of sentence that gets written at speed and then believed for a week.

## Where the numbers come from now

Edge & Node's gateway measures every query it routes, aggregates the results into five-minute buckets, pins each bucket to IPFS, and posts the IPFS address to a `DataEdge` contract on Gnosis (`0x5b4293b4c0f36cb5d4448950830bc777759b6c4f`). Two documents a bucket: one per indexer, deployment, chain and gateway, one per deployment. The indexer document is about 1.7 MB and 2,500 rows, and it lands on chain roughly half an hour after the bucket closes.

That publication is public, permanent and needs no key. What it needed was something to read it. So:

| | Before | Now |
|---|---|---|
| Query Performance | oracle subgraph through the gateway | `qos-reo-nest`: the `DataEdge` calldata and the IPFS documents it names |
| QoS Quality | a Lodestar cron over Postgres copies of the subgraph | the same scoring, ported to kittiwake, over the nest |
| Daily Trends | community performance subgraph | `graph-allocations-nest`: the Arbitrum reward and fee events themselves |
| Probe series | not shown | Foghorn's own measurements, labelled as probes |

Getting there took some new capability in nuthatch, all of it general rather than special-cased for us. A nest can now find an IPFS address inside JSON calldata. Every document is verified against its address before it becomes a row: these documents are too large for a single IPFS block, so nuthatch rebuilds them the way `ipfs add` does and checks the result, and all 4,025 payloads we tested verify. Documents are resolved in the background and retried until they arrive, so a flaky gateway delays a figure rather than losing it; we killed a run mid-backfill with `kill -9` and it came back with 678 of 678. Call rows record their sender, so the nest only accepts documents from the oracle's actual publisher. And sealed segments are now capped by size as well as by row count, because a day of these documents is more JSON than anyone ever planned for.

<!-- TODO(release): backfill span, nest size on disk, serving latency after N4. -->

## The same data, checked

Before trusting any of this we rebuilt the old pipeline from the raw payloads, independently of the nest. One week, 6 to 12 September: 2,014 indexer documents, 4,800,241 rows, 56 indexers.

The daily figures the old chart plotted were right. Success rate per indexer per day matches the rebuild to within 2e-9 percentage points on all 388 indexer-days, and fees match exactly. The nest, reading the chain and IPFS for itself, produced byte-identical documents to the ones we fetched separately, and its daily rollups match the independent rebuild exactly for counts and to within 1e-14 for rates. The QoS Quality scoring, ported from TypeScript to Rust, matches the original on 689 generated cases to within 1.16e-10.

<!-- TODO(release): parity against the old subgraphs over the full window, once run with a key from outside Lodestar. -->

So the raw material was sound. What was done with it on the way to your screen was less so.

## What the old charts got wrong

**The headline numbers were averages of averages.** Each figure at the top of a mini chart was the plain mean of the daily values, so a day with fifty queries counted as much as a day with fifty million. Against a figure weighted by queries, the success rate was off by more than one point for 22 of 56 indexers and by more than five points for 13. staked.cloud showed 62.7% when it had served 83.4%. nodeify.eth showed 56.4% for 69.8%. waynewayner.de showed 78.6% for 67.7%, which is the direction nobody complains about.

**A day hid its outages.** Ellipfra served 97.36% of queries over the week. One five-minute bucket on 8 September served none of 52,286. tehn-r.eth had 474 buckets under 90% success, the worst of them 0 of 5,997; suntzu had 1,209. On a daily chart all of that averages into a line that looks like a mild week.

**Blocks behind was measured in blocks.** Across every chain an indexer serves, whose block times differ by a factor of 48, and dominated by whichever deployment was most stuck. One arbitrum-sepolia deployment 306 million blocks behind put one indexer at 1.59 million blocks behind for the week, a number that describes nothing.

**Average query fee was the latest day only**, while sitting beside window totals.

**The served-versus-allocated gap had its sign wrong for the largest indexers.** The QoS Quality panel compares an indexer's share of allocation with its share of routed queries, to spot indexers the gateway routes around. The old calculation divided an indexer's attempts by the gateway's query count, but the gateway sends one query to several indexers, so shares went as high as 4.0. Ellipfra had 746 deployments with a share over 1. The result read Ellipfra and Pinax as served more than their allocation warrants, when they are routed less. The new share is attempts over every indexer's attempts, bounded and summing to one; the gaps move from -0.14 to 0.10 and from -0.13 to 0.17.

None of these were bugs in Edge & Node's data. They were ours.

## What each figure is now

**Query Count and Query Fees** are what they were: queries Edge & Node's gateway routed to the indexer, and the fees on them, per day and in total for the window.

**Success Rate and Latency** have query-weighted headlines. Under the success chart you can now see bad buckets (five-minute windows with at least 50 queries and under 90% success) and the worst five minutes in the window, with its time and volume.

**Behind Freshest Peer** replaces blocks behind: seconds behind the most up-to-date indexer on the same deployment, converted per chain, with the share of queries served more than five minutes behind.

**Average Query Fee** shows the window and the latest day, labelled as such.

**Gaps are gaps.** A day with some buckets missing is drawn as partial, and a day with none is not drawn at all. The oracle's publisher went quiet for about 38 hours from 29 July and for 37 hours or more from 4 August, and did not backfill either; those days are absent because the data is absent, and the chart now says the publisher was silent rather than implying the indexer was idle.

**QoS Quality** keeps its grade thresholds, its four bars and its per-deployment breakdown, with the gap fixed as above and a history computed over the whole window instead of starting whenever a cron first ran.

**Foghorn's probe series** sits beside Edge & Node's on the success and latency charts, dashed and labelled. It is a different measurement and says so: Foghorn sends block-pinned queries itself and checks whether the answers agree, which the oracle cannot do, so it adds a correctness chart and latency percentiles. Its query count is probes sent, never demand. And its coverage is thin: 127 indexer-deployment pairs against the oracle's 5,401, partly because in one day indexers refused 2,297 of our paid probes by denylisting our payer, against 397 served.

<!-- TODO(release): Foghorn agreement and correctness figures, re-measured after foghorn#3 is deployed and its buckets re-rolled. The pre-fix figures came through endpoints that were counting wrongly and must not be quoted. -->

**Daily Trends** is back with its three tabs, now from the reward and fee events on Arbitrum. Fees are labelled gross, with a net-to-indexer bar beside them.

## The P&L panel was wrong too

Rebuilding Daily Trends meant defining daily rewards carefully, and the P&L panel turned out not to have. It dated indexing rewards by when an allocation closed, and skipped allocations still open, while Horizon pays rewards on open allocations whenever a proof is presented. It also counted the delegators' share as the indexer's revenue, and read fees gross.

Over the 30 days to 13 September, 54 of the 58 indexers that were paid showed a P&L off by more than 1 GRT, with 7.2 million GRT of error in total. Of 24.1 million GRT of rewards collected, the panel had booked 15.7 million. One indexer was shown 259% above what it received; another at half.

The panel now shows what the indexer actually received, dated by the collection that paid it. The fee arithmetic (the 1% protocol cut rounded up, then the curators' share, then the delegators' cut) matches the chain's own payment records for 1,990 collections, to the wei.

## What we still cannot tell you

Organic demand belongs to whoever served it. These figures describe Edge & Node's gateway's traffic, which is most of the network's, but not all of it, and nobody who did not route those queries can reproduce them. The oracle's format carries a gateway ID on every row precisely so that other gateways could publish alongside; none does yet.

Foghorn's numbers are ours and are honest about their limits, which currently include not being allowed to pay a good share of the indexers it would like to measure.

## Checking our arithmetic

Everything above except Foghorn is reproducible without us. The nest is public:

```sh
nuthatch init --from https://github.com/nightswatchhq/qos-reo-nest
```

<!-- TODO(release): the exact run command, the RPC and IPFS flags, and the parity check invocation, once the release build is tagged. -->

It reads Gnosis and IPFS, verifies every document, and its daily rollups are the ones Lodestar serves. If your numbers and ours ever disagree, one of us has a bug, and we would genuinely like to know which.
