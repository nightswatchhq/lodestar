---
title: "Lodestar's API Is Now One Rust Process"
date: "2026-09-07"
author: "cargopete"
tags: ["lodestar", "rust", "nuthatch", "the-graph", "performance", "self-hosting", "vercel", "migration", "infrastructure"]
category: "Infrastructure"
excerpt: "Thirty-six of Lodestar's ninety API routes stopped being serverless functions today and became one long-lived Rust process on a box we own. The median route got 657 times faster, the cold path did not improve at all, and the migration found two bugs that had been quietly breaking the dashboard for months. Here is the accounting."
---

*Yesterday Lodestar [stopped reading any Graph subgraph](/blog/lodestar-reads-no-subgraphs). Today it stopped running most of its API on somebody else's functions. **Thirty-six of ninety routes** now come from a single Rust process on a Hetzner box in Nuremberg, behind Caddy, in front of the same nuthatch nests. The median route is **657 times faster** than the handler it replaced. The cold path is exactly as slow as it was, and saying otherwise would be the interesting kind of lie. This is what moved, what the numbers actually mean, what broke, and what is still on Vercel on purpose.*

---

## The problem was never "serverless is slow"

It is worth being precise about the complaint, because the obvious version of it is wrong. Vercel's functions are fast. The dashboard was slow for three reasons that all have the same root, and none of them is execution speed.

A cold `/api/indexers` took **23.5 seconds** on 6 September. Almost all of that is the nest folding a query it has not been asked before. No runtime fixes that.

The second reason is that every function instance had its own cache. Ten instances warm meant ten copies of the same answer, ten first-requests paying the fold, and a cache hit rate that depended on which instance the router happened to pick. The third is the same shape: the per-IP rate limit was per instance, so the real limit was the configured one multiplied by however many instances existed at that moment, which is not a number anybody knows.

Underneath all three is that the nest is one machine with a small number of SQL slots, and a stateless caller cannot coordinate with itself. Forty readers arriving together on a cold key produced forty identical folds. The nest does not have forty slots. It has four.

## What shipped

One process. It holds the cache, the rate limiter and an admission gate, and because it is one process it can do three things that N instances cannot.

**A global admission gate.** One semaphore per nest, sized to that nest's own permit count, with a narrower inner lane for background jobs so a cron can never take the last slot from a page view. Our own concurrency against each nest is now bounded by construction rather than by hope.

**Request coalescing.** Forty identical cold requests become **one** nest query and forty answers. Measured on a mock nest with a 23,500 ms fold: 40 of 40 readers answered, 1 query issued. This is the one that matters most for the nests, because it turns a traffic spike from a multiplier into a no-op.

**Derived freshness.** Cache lifetimes are computed from how often the underlying data can actually change rather than picked by hand, with a floor of 30 seconds and stale-while-revalidate capped at 300. Nobody has to remember to update a TTL when a cron's schedule moves.

Ten of the crons moved too. The activity feed no longer travels through Redis to get from the job that computes it to the route that serves it, because in one process the job writes the store the route reads. That removes a network round trip from every request and a whole class of "the cron wrote it but the route cannot see it" failure.

## The numbers, and what they do not say

Measured on 7 September, immediately before the switch, median of three requests per route with a unique parameter on each so neither side could answer from a CDN.

| Route | Before | After | |
|---|---|---|---|
| `/api/tvl` | 251.1 ms | 0.2 ms | 1300x |
| `/api/token-metrics` | 264.4 ms | 0.3 ms | 1021x |
| `/api/network-stats` | 270.5 ms | 0.3 ms | 878x |
| `/api/poi?first=50` | 447.9 ms | 0.5 ms | 921x |
| `/api/indexer/<addr>` | 732.9 ms | 4.4 ms | 165x |
| `/api/indexer-status/<addr>` | 870.5 ms | 264.1 ms | 3.3x |
| `/api/subgraph-fees-30d` | 700.4 ms | 847.0 ms | **0.8x** |

**Median 657x across 24 comparable routes.** Now the caveats, because that number will get quoted and it should not be quoted naked.

The harness ran on the same box as the Rust service, so its column carries no network at all and Vercel's carries the round trip from Nuremberg. A fair share of 657 is distance rather than compute. The figure worth standing behind is the narrower one: every migrated route except two now answers in **under 5 ms of actual work**, where the previous handler took between 230 and 870.

The first measurement I took reported a **median of 0.1x**, which is to say the migration had made everything worse. Two faults, both in the harness. It timed in whole milliseconds, so every fast route read `0` and was then indistinguishable from "did not answer" and dropped out of the ratio, leaving the summary computed from the slow routes only. And it was comparing our origin against Vercel's CDN, which answered every route in about 35 ms whatever it actually cost to compute. A benchmark that flatters you is bad; one that libels you is at least easy to notice.

`/api/subgraph-fees-30d` is genuinely slower and is being worked on.

## The cold path did not improve, and it was never going to

A cold `/api/indexers` still takes 23.5 seconds, because the nest still has to fold the query and no amount of Rust changes what a fold costs. The design brief for this work said a migration is only justified if it beats the current system on every measured number, and on this one it does not. It ties.

What changed is what a cold request costs *everyone else*. Forty concurrent cold readers used to mean forty folds against a machine with four slots. Now it means one fold, and the other thirty-nine wait on the same future rather than queueing behind each other at the nest.

## Two bugs that had been there for months

Migrations find things, and these two are worth writing down because both were invisible in exactly the same way.

**Every subgraph on the dashboard was nameless.** The IPFS metadata cache wrote documents as `${JSON.stringify(doc)}::jsonb`. The Postgres driver serialises a JavaScript string bound to a `jsonb` column as a JSON *string*, so the column held `"{\"displayName\":\"Lido Ethereum\"}"` rather than an object, and `json->>'displayName'` returned null on all **15,972** cached documents. The subgraph names batch returned `{}`. Every deployment in every list rendered without a name. Name search returned nothing, for every query, with a 200 status. All of which looks precisely like a world in which subgraphs do not have names.

We found it because the Rust port's search returned zero results for "uniswap" and so did the incumbent. Two systems agreeing is usually reassuring; here it meant the same broken rows underneath both. Repairing the column recovered **15,782 display names**. Painfully, the codebase already carried a comment describing this exact bug, learned on a different table two months ago. The lesson was written down and this file never got it.

**A busy search built a 34 KB URL.** The nest takes its SQL as a query parameter and refuses a request line over 16 KB with a bare `400`. A search matching 433 cached documents builds an `IN (...)` list of 433 bytes32 ids, which is 34 KB. Measured: 200 ids and 15.7 KB is accepted, 433 and 33.9 KB is not. This had been unreachable for as long as it had, because before the metadata was repaired no search ever matched enough documents to build a long list. One bug was hiding the other. Both sides now chunk at 100 ids.

## The part where I was wrong about rate limiting

The plan was that the edge would pass the visitor's address in `X-Forwarded-For` and the Rust service would read it. Behind Caddy that header is trustworthy, the reasoning went, because Caddy is the only thing that can set it.

Caddy **replaces** `X-Forwarded-For` with its own peer unless that peer is a configured trusted proxy. This is correct of it, since preserving an arbitrary caller's chain is exactly how header spoofing works, and it means the browser address the edge writes never survives the hop. Left alone, every visitor in the world would have arrived at the backend wearing Vercel's address and shared a single rate-limit bucket of 120 requests a minute. The dashboard would have started refusing its own users while every log and dashboard said the service was healthy.

The fix is a header Caddy does not manage. The edge names the client in `X-Lodestar-Client`, which is believed only when a shared secret matches, compared in constant time. The alternative was maintaining Vercel's egress ranges in the Caddyfile, and that is a list which goes stale silently.

Diagnosing it took an afternoon of firing three hundred requests at the box and inferring the answer from how many came back 429, so `/api/whoami` is now a permanent route. It returns which address the rate limiter attributed the request to, whether the edge was trusted, and what each header said. Same class of bug, one curl from now on.

## What is honestly still true

The earlier benchmark notes claimed `server busy` refusals were "zero by construction of the gate". That was overclaimed and I have corrected it. The gate bounds *our* concurrency against a nest and cannot bound anyone else's, and the protocol nest has three independent consumers: the live dashboard, Foghorn, and the new service. Occasional refusals are honest rather than alarming, and they should go to zero now that traffic has moved.

Four requests returned 503 during the first cold sweep after the switch, each after exactly 3,000 ms, which is the gate's read-queue timeout. That is the service shedding load rather than piling onto a cold nest, which is what it is meant to do, but it does mean a burst against an empty cache will refuse some requests. Warm, everything is under a second.

## What did not move

Fifty-four routes are still Next handlers, and nine of those are deletions rather than ports: push notifications and the Lodie assistant were both discontinued last week, the Seahorn routes point at a host that has not answered since July, and the provider-liveness check goes with the Dispatch gateway we are retiring.

The rest is the product layer. The Dock's nine routes, Scuttlebutt's six, the wasm disassembler's three, the named-query tier, and a long tail of twenty-five that wants triaging rather than porting, because some of it should be deleted instead. None of it blocks anything: the rewrite sends the migrated routes to the Rust service and leaves the others exactly where they were, and the two coexist on one domain.

TAP escrow provisioning is the one cron staying put for a reason other than scheduling. It holds a signing key and spends GRT, and moving it means putting that key on a box which also runs Postgres and two public HTTP services. That is a decision about custody, not a port.

## Rolling it back

`LODESTAR_API_ORIGIN`. Unset it and every route returns to the Next handler on the next request, with no redeploy and no build. The Postgres schema is unchanged apart from three additive tables that nothing else reads, so there is no data to undo either.

That property is worth protecting, and the moment a change alters an existing table it stops being free.

## Where it stands

Twenty-four routes at shape parity with zero breaking differences before the switch. Twenty-eight of twenty-eight answering afterwards, twice over. 208 tests. Four failed responses since cutover, all from my own cold sweep. Load average 0.03 on a four-core box.

The next honest step is to leave it alone for a day and see what a full traffic cycle does to it, then turn on the ingest jobs after running both writers side by side and comparing rows, which is a decision to take once rather than a flag to flip. The parity harness itself needs fixing first, mind: now that the rewrite is live, pointing it at the dashboard compares the service with itself and reports perfect parity for entirely the wrong reason.

A check that can accidentally grade its own homework should say so out loud.
