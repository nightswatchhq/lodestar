// Where the frontend rewrite actually is, counted rather than estimated.
//
//   node scripts/rewrite-progress.mjs
//   node scripts/rewrite-progress.mjs --json
//
// The plan is `docs/rfc-the-frontend-after-the-backend-left.md`: five Stage 1 items, then a
// Stage 2 that only happens if Stage 1 leaves the App Router still causing trouble. A tracking
// issue carrying percentages somebody typed in goes stale the same afternoon, so each item here
// has a measure that can be re-run, and the number comes from the repository.
//
// Every measure is deliberately crude and deliberately checkable. `done/total` where both halves
// are things you can go and count beats a confident 60% that nobody can reproduce.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src'];
const JSON_OUT = process.argv.includes('--json');

function files(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__' && entry !== 'node_modules') files(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const sources = ROOTS.flatMap((r) => files(r));
const FETCH_CALL = /fetch\(\s*['"`]\/api\//g;

/**
 * The modules that *are* the typed surface, and so cannot be bypassing it.
 *
 * `foghorn.ts` is `lib/api.ts` for the foghorn proxy: one `foghornGet` that every fetcher in the
 * file goes through. Counting its two requests as call sites to move meant the number could never
 * reach the bottom, and would have had somebody rewriting a client to call a client.
 */
const THE_TYPED_SURFACE = new Set(['src/lib/api.ts', 'src/lib/foghorn.ts']);

/**
 * Strip comments before counting: a path mentioned in prose is not a call site.
 *
 * This counter reported three requests in `foghorn.ts` when the file makes two. The third was
 * `fetch('/api/foghorn/…')` quoted inside a doc comment explaining a request that had just been
 * removed - so a comment about deleted code was being counted as the code. `kittiwake-routes.test`
 * learned this and wrote it down; this script was written afterwards and did not read it.
 *
 * Block comments only where one opens a line, for the reason that file also records: a string
 * literal containing `/*` starts a comment for a naive stripper and swallows the rest of the file.
 */
function code(src) {
  return src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Call sites that build their own request instead of going through the typed surface. */
function bypassing() {
  const hits = [];
  for (const f of sources) {
    if (THE_TYPED_SURFACE.has(f)) continue;
    const count = (code(readFileSync(f, 'utf8')).match(FETCH_CALL) ?? []).length;
    if (count) hits.push({ file: f, count });
  }
  return hits;
}

const bypass = bypassing();
const bypassCalls = bypass.reduce((n, b) => n + b.count, 0);

/**
 * The denominator is what it was when the rewrite started, at `e55d19a`.
 *
 * Hardcoded rather than computed from git, because the interesting number is progress against the
 * size of the job as it was understood then, and a `git grep` at an old ref is a different thing
 * to maintain. Update it only if the baseline is genuinely re-measured, and say so when you do.
 *
 * Re-measured once, from 50 to 48, when the counter stopped counting commented-out requests and
 * stopped counting `foghorn.ts` - which is a typed client rather than something bypassing one.
 * Both halves of the fraction are counted the same way, which is the only thing that makes it mean
 * anything.
 */
const BYPASS_AT_START = 48;

/** Five OpenGraph routes render on the server. A static bundle cannot, so this gates Stage 2. */
const ogRoutes = sources.filter((f) => /opengraph-image\.tsx$/.test(f));

/**
 * The wallet paths Vitest cannot cover, which is the whole argument for smoke-testing them.
 *
 * What the spec reaches is each flow's entry: the wallet connects, the page renders its write
 * surface, and nothing is dispatched. Asserting a *successful* dispatch needs a funded account or
 * an interceptor in front of the Arbitrum RPC, and neither exists - see the note in
 * `wallet.spec.ts`. So this counts flows whose entry is covered, not transactions proven.
 */
const WALLET_FLOWS = ['delegate', 'undelegate', 'curate', 'dock publish', 'dock lifecycle'];
/** How `wallet.spec.ts` names each flow, where it names it at all. */
const WALLET_PATTERNS = {
  delegate: /delegate/i,
  undelegate: /undelegate/i,
  curate: /curate/i,
  'dock publish': /dock/i,
  'dock lifecycle': /lifecycle/i,
};
/**
 * The TEST NAMES, not the file.
 *
 * Matching the file matched the doc comment at the top of it, which lists all five flows while
 * explaining which of them the spec reaches - so prose about what is *not* covered counted as
 * coverage, and this read 5/5. That is the second time in this script that a comment has been
 * counted as the thing it describes; the first was a `fetch('/api/…')` quoted in a doc comment.
 * Both times the fix was to read what the code does rather than what it says about itself.
 */
const walletTitles = existsSync('scripts/e2e/wallet.spec.ts')
  ? [...readFileSync('scripts/e2e/wallet.spec.ts', 'utf8').matchAll(/^test\(\s*'([^']+)'/gm)].map(
      (m) => m[1],
    )
  : [];
// The denominator stays at the five the RFC named. Counting three out of three covered would be
// moving the goalposts to where the ball landed, which is the move this script exists to prevent.
const walletCovered = WALLET_FLOWS.filter((f) =>
  walletTitles.some((t) => WALLET_PATTERNS[f].test(t)),
);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const rainbowInstalled = Boolean(pkg.dependencies?.['@rainbow-me/rainbowkit']);
const rainbowUsed = sources.some((f) => /rainbow/i.test(readFileSync(f, 'utf8')));

const routeFiles = existsSync('src/app/api');
const proxyGone = !existsSync('src/proxy.ts');

// Rough size of each item relative to the others, so the headline is not a straight mean.
//
// It was a straight mean first, and deleting one unused dependency - a single line, verified in
// about a minute - moved Stage 1 from 18% to 38%. A number that can be doubled by an afternoon's
// tidying is not measuring the job. These are guesses, they are visible, and they are meant to be
// argued with rather than trusted.
const WEIGHT = {
  1: 2,   // needs a decision about CORS and where rate limiting lives, then the work
  2: 0.5, // one line, once nothing imports it
  3: 5,   // the bulk of it, and the part that makes any later move cheap
  4: 2,   // five flows, each needing a wallet harness that does not exist yet
  5: 2,   // a decision, and possibly an image service to build behind it
};

const items = [
  {
    id: 1,
    title: 'Finish the route migration and delete src/proxy.ts',
    // Two halves, and only one of them is a matter of work: the second needs a decision about
    // CORS and where rate limiting lives once the browser talks to kittiwake directly.
    done: (routeFiles ? 0 : 1) + (proxyGone ? 1 : 0),
    total: 2,
    detail: `${routeFiles ? 'src/app/api still exists' : 'no route files'}; ${
      proxyGone ? 'proxy.ts deleted' : 'src/proxy.ts still forwarding'
    }`,
  },
  {
    id: 2,
    title: 'Delete the unused RainbowKit dependency',
    done: rainbowInstalled ? 0 : 1,
    total: 1,
    detail: rainbowInstalled
      ? `installed, ${rainbowUsed ? 'and imported somewhere' : 'and imported nowhere'}`
      : 'gone',
  },
  {
    id: 3,
    title: 'Route every query through one typed client',
    done: BYPASS_AT_START - bypassCalls,
    total: BYPASS_AT_START,
    detail: `${bypassCalls} call sites still build their own request, across ${bypass.length} files`,
  },
  {
    id: 4,
    title: 'Playwright smoke tests for the wallet flows',
    done: walletCovered.length,
    total: WALLET_FLOWS.length,
    detail: walletTitles.length
      ? `${walletTitles.length} tests; flows named: ${walletCovered.join(', ') || 'none'}`
      : 'scripts/e2e/wallet.spec.ts has no tests',
  },
  {
    id: 5,
    title: 'Stage 1a: decide what happens to next/og',
    // Nothing to count until a decision exists, so this is 0 or 1 and stays 0 until it is written
    // down somewhere. Five server-rendered routes is the size of the thing being decided.
    done: 0,
    total: 1,
    detail: `${ogRoutes.length} server-rendered OpenGraph routes, no decision recorded`,
  },
];

const pct = (d, t) => Math.round((d / t) * 100);
const weightTotal = Object.values(WEIGHT).reduce((a, b) => a + b, 0);
const overall = Math.round(
  (items.reduce((s, i) => s + (i.done / i.total) * WEIGHT[i.id], 0) / weightTotal) * 100,
);
const unweighted = Math.round(
  (items.reduce((s, i) => s + i.done / i.total, 0) / items.length) * 100,
);

if (JSON_OUT) {
  console.log(JSON.stringify({ overall, unweighted, weights: WEIGHT, items, bypass }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nStage 1 of the frontend rewrite\n${'-'.repeat(102)}`);
console.log(
  `${pad('', 4)}${pad('item', 48)} ${pad('done', 8)} ${pad('pct', 6)} ${pad('weight', 7)} detail`,
);
for (const i of items) {
  console.log(
    `${pad(`${i.id}.`, 4)}${pad(i.title, 48)} ${pad(`${i.done}/${i.total}`, 8)} ${pad(
      `${pct(i.done, i.total)}%`,
      6,
    )} ${pad(WEIGHT[i.id], 7)} ${i.detail}`,
  );
}
console.log('-'.repeat(102));
console.log(`Stage 1: ${overall}% by weight, ${unweighted}% if every item counted the same.\n`);

if (bypass.length) {
  console.log('Still building their own requests, largest first:');
  for (const b of [...bypass].sort((a, z) => z.count - a.count)) {
    console.log(`  ${pad(b.count, 4)} ${b.file}`);
  }
  console.log();
}
