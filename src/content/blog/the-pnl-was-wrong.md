---
title: "The P&L Panel Was Wrong, and Daily Trends Is Back"
date: "2026-09-TODO"
author: "cargopete"
tags: ["lodestar", "nuthatch", "indexers", "rewards", "query-fees", "horizon", "correction"]
category: "Infrastructure"
excerpt: "Rebuilding the Daily Trends chart meant defining an indexer's daily rewards carefully, and doing that showed the P&L panel had been getting them wrong. Over the 30 days to 13 September it misstated 54 of the 58 indexers that were paid. Both are fixed today, and here is exactly what was wrong, how we checked the new figures, and what is still to come."
---

*When Lodestar stopped holding a Graph API key on 5 September, the indexer page lost three things: Query Performance, the QoS Quality panel, and Daily Trends. Daily Trends is back today. So is a P&L panel that shows the right numbers, which is the part of this post we would rather not have had to write.*

---

## The P&L panel was wrong

The P&L panel on each indexer page shows what the indexer earned over a window, in rewards and query fees, against a cost model. Three things were wrong with how it counted, and all three had been wrong in production.

**Rewards were dated by when an allocation closed.** Under Horizon an indexer collects indexing rewards whenever it presents a proof, including on allocations that stay open. The panel only counted an allocation's rewards once the allocation closed, and put them all on that day. Rewards collected on open allocations were either late or missing.

**The delegators' share was counted as the indexer's revenue.** An indexing reward is split between the indexer and its delegators, and the panel showed the whole thing.

**Query fees were shown gross.** Before a fee reaches the indexer, 1% goes to the protocol, a share goes to curators, and the delegators take their cut. The panel showed the amount before any of that.

Over the 30 days to 13 September, 54 of the 58 indexers that were paid saw a P&L off by more than 1 GRT, with 7.2 million GRT of error across them. Of 24.1 million GRT of rewards collected in that window, the panel had booked 15.7 million. The errors went both ways: one indexer was shown 259% above what it actually received, another at half of it.

If you made a decision based on that panel, we are sorry. It should not have been possible for it to be this far out without anyone noticing, and the fact that it was is a large part of why we now check every figure against the chain before shipping it.

## What it shows now

The panel now shows what the indexer actually received, dated by the collection that paid it. Rewards come from the reward events on Arbitrum, split the way the contracts split them. Fees are what is left after the protocol cut (rounded up, as the contract rounds it), the curators' share and the delegators' cut. We checked that arithmetic against the chain's own payment records for 1,990 collections, and it matches every one to the wei.

The panel carries a note saying it was corrected, and when.

## Daily Trends is back

Daily Trends shows an indexer's rewards (indexer and delegator, stacked) and query fees per day, with a running total. It used to read a community subgraph through a gateway key; it now reads the same Arbitrum events through our own nest.

We compared the chain's reward and fee events against that community subgraph for every indexer and every day from 24 July to 22 August: 327 indexer-days, seven figures each. All of them match to the wei.

<!-- TODO(release): after the nest deploys, run the same comparison through the new daily view itself on production, including pre-Horizon rewards, and replace the paragraph above with that result. Do not publish until that comparison is exact or its differences are explained here. -->

Fees are now labelled gross, with a separate net-to-indexer series beside them, because the old chart never said which it was showing.

## What is still to come

Query Performance and the QoS Quality panel are not back yet. They are rebuilt, and rebuilding them turned up problems with the old versions too, which will get their own post when they ship. The short version: the old charts averaged averages, hid outages inside daily figures, and were built on a subgraph that had silently dropped whole five-minute buckets of data. We would rather ship them late and right.

## Checking our work

Both figures come from `graph-allocations-nest`, which is public. Anyone can run it and derive the same numbers:

```sh
nuthatch init --from https://github.com/nightswatchhq/graph-allocations-nest
```

<!-- TODO(release): the release date, the exact view names and a one-line query per figure, and the PR numbers as merged. -->

If your numbers and ours disagree, tell us. Last time, they should have.
