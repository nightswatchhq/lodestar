# [RFC] The frontend after the backend left: should we rewrite, and in what?

## TL;DR

**Stay on React. Leave Next.js. Move to a Vite + React SPA.**

Lodestar has spent the last fortnight moving every backend concern into kittiwake. What is left is a
client for one JSON API, still wearing a server framework. None of Next's differentiators are
load-bearing any more: no React Server Components in anger, no server-side data fetching, no ISR, no
caching semantics worth the name. What remains is the part of Next that costs us something, which is
the implicit behaviour an unsupervised coding agent gets wrong: the `"use client"` boundary, the
cache model, file-convention routing, and a breaking major version roughly once a year.

Ruled out, with reasons below: SvelteKit and SolidStart (a full rewrite of 42 pages and 68
components to buy reactivity we can get from virtualisation), Astro (wrong shape for a
wallet-connected dashboard), and Leptos and Dioxus (a bespoke wallet connector layer we would own
forever).

**Cost: 3 to 6 person-weeks, and the test suite ports whole.** I checked: not one of the 106 test
files imports anything from `next/`.

## What I verified rather than assumed

This RFC started from a research brief. Five of its claims did not survive contact with the repo,
and three of those changed the plan. Everything below was measured on 2026-09-11.

**RainbowKit is not in this codebase.** `@rainbow-me/rainbowkit@^2.2.11` is in `package.json` and is
imported by exactly zero files. The wallet surface is `src/lib/wallet.ts`, fifty-four lines, one
`createConfig` with `injected()`, `walletConnect()` and `coinbaseWallet()`. This matters twice over:
there is no connect-modal migration risk on any path because there is no connect modal, and we are
shipping a dependency nothing uses. Delete it.

**The wallet layer is already consolidated.** The brief's highest-leverage preparatory step was
"consolidate the wallet layer into one module `lib/wallet`". That module exists and is already the
single surface. Nothing to do.

**Vite is already here.** `vite@^8.2.0` and `vitest@^4.1.10` are in devDependencies, because Vitest 4
runs on Vite. The build tool the migration moves to is already in the tree and already green.

**The test suite has no Next coupling whatsoever.** The brief estimated 95% carry-over with "only
Next-specific mocks needing swapping". The real figure is 100%: zero test files import `next/link`,
`next/navigation` or anything else from Next. Of roughly 1,237 test cases, 187 use Testing Library
and the rest are logic tier, and even those 187 are React Testing Library, which a Vite React SPA
runs unchanged.

**The repo is bigger than the brief thought.** 68,093 lines of TS/TSX against an estimated 51,600.
42 pages matches; 68 components against 71. The line count does not change the recommendation but it
does push the estimate toward the upper end of the range.

## The thing nobody costed: `next/og`

Here is the one real obstacle, and it was not in the brief.

Five routes generate OpenGraph images at request time through `next/og`:

```
src/app/opengraph-image.tsx
src/app/blog/[slug]/opengraph-image.tsx
src/app/indexers/[address]/opengraph-image.tsx
src/app/subgraphs/[hash]/opengraph-image.tsx
src/app/disassembly/[deploymentId]/opengraph-image.tsx
```

Three of those are per-entity: a card rendered for one indexer, one subgraph, one deployment. That is
server-side rendering, it is genuinely useful, and **a static SPA cannot do it.** A crawler does not
execute JavaScript, so "render it on the client" is not an answer.

There are three ways out and they should be chosen deliberately rather than discovered halfway
through a migration:

1. **Move image generation to kittiwake.** Honest and consistent with everything else we have done,
   and the most work: text layout and PNG encoding in Rust, for cards we currently get from a JSX
   template.
2. **Keep one small Next deployment for the five image routes** and serve the app statically beside
   it. Cheap, and it means we have not actually left Next, which undercuts the whole point.
3. **Go static.** One hand-made card per page type, no per-entity rendering. Costs nothing, and a
   shared indexer link stops showing that indexer.

I would take (1), sized separately and done before the migration rather than during it. It belongs in
kittiwake by the same argument that moved everything else, and it is the only option that leaves
Lodestar genuinely frontend-only. But it is real Rust work and it should not hide inside a "3 to 6
weeks" estimate.

### Decided, 2026-09-12: none of the three. `next/og` is not what it looks like.

**The premise of the whole section was wrong, and checking it took four minutes.**

`next/og` is a re-export. The whole of `node_modules/next/og.js` is:

```js
module.exports = require('./dist/server/og/image-response')
```

and that module dynamically imports `next/dist/compiled/@vercel/og/index.node.js`. `ImageResponse`
is `@vercel/og`'s class - satori for layout, resvg-wasm for encoding - vendored into Next rather
than belonging to it. Nothing about it needs a React Server Component, an App Router, or a Next
build.

Verified rather than reasoned about: calling that vendored module from plain `node`, with no Next
runtime anywhere, returns a real 1200x630 PNG with `content-type: image/png`. The whole test was ten
lines and it is the difference between a week of Rust and an afternoon.

**So the five routes become five functions, and the 988 lines of JSX in them do not change.**

- `import { ImageResponse } from 'next/og'` becomes `from '@vercel/og'`, five times.
- The files move from `src/app/**/opengraph-image.tsx` to `api/og/*.ts`, which Vercel serves beside
  a static bundle without a framework. The `api/` convention predates Next and does not require it.
- Two of them declare `export const runtime = 'nodejs'`. Both declarations are stale: they were
  added when those cards read Postgres and Redis directly, and since `og-data.ts` they read the API
  like everything else. Neither route uses a Node-only API - the whole path is `fetch`,
  `AbortController` and `setTimeout` - so both declarations go.

### What this costs, stated plainly

It **does not** make the repository serverless-free. Five functions is not zero functions, and a
static bundle plus five functions is a different claim from "a static bundle". Anyone who wanted
Stage 2 to mean "nothing but files on a CDN" should know that this does not deliver that, and
nothing short of option (3) - static cards, losing the per-entity numbers - would.

It does not lock us to Vercel either. satori and resvg-wasm are ordinary packages; the same five
functions run on any Node or edge host, and that is worth knowing before the separate question of
whether to leave Vercel gets asked.

And option (1) stays available. If kittiwake should own image generation on principle, that argument
is unchanged - what has changed is that it is no longer the price of admission for Stage 2, so it can
be argued on its merits rather than because a migration is blocked behind it.

**Stage 2 is unblocked.** That was the only thing this section was gating.

## Why not the other candidates

**SvelteKit and SolidStart** are technically viable. `@wagmi/core` and `viem` are framework-agnostic,
and Reown AppKit covers the connect modal for Svelte and Vue, so the wallet is not the blocker the
brief's framing first suggests. The blocker is that both are a full rewrite of 42 pages and 68
components to buy fine-grained reactivity, and our per-row fan-out is a data problem that TanStack
Query already solves identically in every framework. TanStack Virtual is what actually makes a
dense table feel quick, and it exists for React. Svelte 5's runes also post-date many model training
cutoffs, which cuts directly against the reason we are doing this.

**Astro** is the wrong shape. It is for content-heavy, mostly-static pages. We would end up with one
enormous React island and all of Astro's ceremony for none of its benefit.

**Leptos and Dioxus** are ruled out by the wallet, and this is the one place where "you would write
your own connector layer" is simply true. There is no maintained Rust WalletConnect v2 stack. Alloy
ships no browser or injected provider and its own documentation defers JS-facing needs to viem.
We would be hand-maintaining `wasm-bindgen` glue to `window.ethereum` for injected wallets only, or
calling back into wagmi through JS interop, which defeats the purpose. Sharing types with kittiwake
is a genuine attraction and it is nowhere near large enough to pay for that.

I want to be plain about the temptation here, because it is mine as much as anyone's: a Rust
frontend next to a Rust backend is an appealing picture, and the wallet stack is the reason it does
not work today. If a production-grade Rust WalletConnect v2 and connect modal appear, this decision
is worth reopening. Nothing like it exists now.

## What actually gets better

The case for leaving Next is not performance. It is that **Next's implicit behaviour is the class of
thing an unsupervised agent gets wrong**, and we no longer get anything back for it.

After the move, every file is a client module. There is no `"use client"` boundary to place
correctly, no cache model whose semantics change between minor versions, no `layout.tsx` /
`loading.tsx` / `error.tsx` conventions that do things by being named things, and no annual major
version migration. Routing becomes a config file an agent can read in one sitting.

Secondary: a static bundle can be served straight off the Nuremberg box behind the Caddy that already
fronts kittiwake, which removes the Vercel edge-rewrite indirection entirely. `src/proxy.ts` and the
`MIGRATED` list stop existing, and the browser talks to kittiwake directly.

## What gets worse

`next/link` prefetching (46 files), `next/image` optimisation (2 files), `next/dynamic` (7 files,
becomes `React.lazy`), `next/font/google` (1 file), and file-based routing convenience. Code-splitting
boundaries become ours to choose explicitly. We lose Vercel's zero-config preview deploys unless we
rebuild that. And 3 to 6 weeks of mechanical churn carries regression risk in navigation and
metadata, though SEO matters little for a wallet dashboard.

The `next/server` imports (11 files) resolve themselves: they are the last API routes and the proxy,
all of which are leaving anyway.

## Plan

**Stage 1, now, and worth doing even if we never migrate.** Finish the route migration and delete
`src/proxy.ts`. Delete the unused RainbowKit dependency. Generate a typed kittiwake client from its
OpenAPI document and route every query hook through it, which is the framework-agnostic invariant
layer that makes any future move cheap. Add Playwright smoke tests for the four or five wallet flows,
because those are the only paths the Vitest suite cannot cover and the only ones where a migration
regression would be expensive.

**Stage 1a: decide `next/og`.** ~~Size the kittiwake image service.~~ **Decided 2026-09-12: not
needed.** `next/og` re-exports a vendored `@vercel/og`, which renders a PNG from plain node with no
Next runtime - checked, not assumed. The five routes become five `api/og/*.ts` functions with their
JSX unchanged. See the section above. **Stage 2 is no longer gated on this.**

**Stage 2, only if Stage 1 leaves the App Router still causing agent errors.** Scaffold Vite + React
+ TanStack Router, move pages one to one, replace the Next imports enumerated above, keep wagmi,
viem, Recharts and the TanStack stack untouched, carry `vitest.config.ts` across as it is.

**The benchmark that says stop:** if after Stage 1 agents are landing correct changes and CI stays
green, do not migrate. Most of the benefit was in the simplification, and 3 to 6 weeks is a real
price.

## Open questions

- ~~Which `next/og` option, and is the kittiwake image service worth its own RFC?~~ Settled: the
  five routes move as they are. Whether kittiwake *should* own image generation on principle is now
  an ordinary question rather than a blocker, and it does not need answering to start Stage 2.
- Do we want to leave Vercel at all, or keep it for preview deploys and serve the static bundle from
  there? The migration does not require leaving, and the two decisions should not be bundled.
- Recharts is heavier than uPlot or ECharts by some margin. That is a larger bundle win than the
  framework swap and it is independent of this decision, so it should be argued separately rather
  than smuggled in.
