/**
 * How much of the API has moved to kittiwake, and how much is still Next.
 *
 * This file is the single list. `src/proxy.ts` imports `MIGRATED` from here rather than keeping
 * its own copy, because the defect behind nightswatchhq/kittiwake#23 was exactly two lists that
 * had to agree and nothing enforcing it: three routes sat in the proxy's list and in no harness,
 * so they moved to production unchecked and answered 200 with a payload the frontend could not
 * read. One list cannot disagree with itself.
 *
 * The inventory below is checked against the filesystem by `migration.test.ts`: every
 * `src/app/api/**\/route.ts` must appear here and every entry here that claims a Next route must
 * exist. A route added without a line in this table fails the suite rather than quietly becoming
 * an uncounted straggler, which is the same guarantee kittiwake's parity harness gives from the
 * other side.
 *
 * The counts this produces are deliberately unflattering. A migration reports its progress
 * honestly or it is a morale exercise.
 */

/**
 * The routes the edge sends to kittiwake, as its own router lists them.
 *
 * A trailing slash means "one more path segment", which is how the parameterised routes are
 * expressed. Everything else matches exactly: `/api/indexers` must not swallow
 * `/api/indexers-enriched`, and a bare `startsWith` would do precisely that.
 *
 * Kept in step by hand, which is the honest weakness of it. What catches a drift is the parity
 * harness on the kittiwake side and the filesystem check on this one.
 *
 * A route answering in kittiwake is not on its own a reason to add it here. `indexing-status` is
 * the standing example: it is served there and the parity harness compares it, and it stays on Next
 * anyway, because kittiwake probes without a TAP receipt and so cannot tell a serving stack that
 * wants payment from one that actually served. Its entry below records that. The bar for this list
 * is that the harness compares the route **and** the answer is not weaker than the one it replaces.
 */
export const MIGRATED: readonly string[] = [
  '/api/apr-provenance/',
  '/api/chain-lag',
  '/api/curators',
  '/api/delegate/recommend',
  '/api/delegation-events',
  '/api/delegation-flows',
  '/api/developer-activity',
  '/api/dips',
  '/api/dips/agreements',
  '/api/dropped-chains',
  '/api/ens',
  '/api/epochs',
  '/api/foghorn/**',
  '/api/grt-flow',
  '/api/horizon/activity',
  '/api/indexer-disputes/',
  '/api/indexer-node-health',
  '/api/indexer-stake-history/',
  '/api/indexer-status/',
  '/api/indexer/',
  '/api/indexer/*/pnl',
  '/api/indexer/*/revenue',
  '/api/indexers',
  '/api/indexers-enriched',
  '/api/manifest',
  '/api/network-stats',
  '/api/operator-preflight',
  '/api/parameter-history/',
  '/api/payments',
  '/api/poi',
  '/api/portfolio',
  '/api/price',
  '/api/provisions',
  '/api/qos/capture',
  '/api/reo',
  '/api/rewards-history',
  '/api/service-census',
  '/api/sql/catalog',
  '/api/sql/named',
  '/api/sql/query',
  '/api/subgraph-curation/',
  '/api/subgraph-deployments',
  '/api/subgraph-fees-30d',
  '/api/subgraph-history/',
  '/api/subgraph-names',
  '/api/subgraph-schema/',
  '/api/subgraph-search',
  '/api/subgraph-versions/',
  '/api/support',
  '/api/support/',
  '/api/token-metrics',
  '/api/tvl',
  '/api/whoami',
];

/**
 * Routes that must never be forwarded, whatever a prefix says.
 *
 * `/api/indexer/present-poi` sits in the address slot of `/api/indexer/`, so a prefix rule cannot
 * tell it from an address. Before this list existed the edge forwarded it and kittiwake's
 * `/api/indexer/{address}` handler answered `400 not a valid address` - a plausible-looking error
 * for a route that was never broken, on a POST that submits a PoI.
 */
const NEVER_FORWARD: readonly string[] = ['/api/indexer/present-poi'];

/**
 * Is this exact route one of the migrated ones?
 *
 * A trailing slash means **exactly one more segment**, not "everything under it". The difference
 * was three live faults: `/api/indexer/` was forwarding `/api/indexer/<addr>/pnl` and
 * `/api/indexer/<addr>/revenue` to a backend with no handler for either, so both answered `404` in
 * production while the Next handlers that would have served them sat one rewrite away, unreached.
 *
 * A `*` segment is the nested form the comment above used to say would need its own entry, and now
 * does: `/api/indexer/*\/pnl` matches one segment in that position and nothing else. It matches
 * `/api/indexer/0xabc/pnl` for the proxy and `/api/indexer/[address]/pnl` for the inventory check,
 * which are the two callers, and it deliberately cannot match a deeper path.
 */
export function isMigrated(path: string): boolean {
  if (NEVER_FORWARD.includes(path)) return false;
  return MIGRATED.some((p) => {
    if (p.endsWith('/**')) return matchesCatchAll(p, path);
    if (p.includes('*')) return matchesWildcard(p, path);
    if (!p.endsWith('/')) return path === p;
    if (!path.startsWith(p)) return false;
    const rest = path.slice(p.length);
    return rest.length > 0 && !rest.includes('/');
  });
}

/**
 * `prefix/**` matches one or more segments below `prefix`, which is what a Next `[...path]`
 * catch-all route is.
 *
 * This is the "everything under it" rule the trailing slash deliberately is not, and it is only
 * safe where the prefix owns every path below it. `/api/foghorn/` does: the whole subtree is one
 * proxy. `/api/indexer/` does not, which is why `/api/indexer/<addr>/pnl` needed an entry of its
 * own and why `present-poi` needed pinning in NEVER_FORWARD. Do not reach for this one to save
 * typing.
 */
function matchesCatchAll(pattern: string, path: string): boolean {
  const prefix = pattern.slice(0, -2);
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.startsWith('/');
}

/** Segment by segment, with `*` standing for exactly one non-empty segment. */
function matchesWildcard(pattern: string, path: string): boolean {
  const want = pattern.split('/');
  const got = path.split('/');
  if (want.length !== got.length) return false;
  return want.every((seg, i) => (seg === '*' ? got[i].length > 0 : seg === got[i]));
}

/** Where a route is served from today, which is a different question from where it should end up. */
export type RouteState =
  /** The edge rewrites it to kittiwake. Done. */
  | 'kittiwake'
  /** Still Next, and there is work to do. */
  | 'next'
  /** Still Next by decision rather than by backlog, with a reason. */
  | 'staying'
  /** Agreed for deletion rather than porting. Counting these as outstanding work overstates it. */
  | 'doomed'
  /** A scheduled endpoint, not public read surface. Not part of the port; kittiwake schedules its own. */
  | 'cron';

/** Which block of work a route belongs to, so the panel groups rather than lists ninety things. */
export type Workstream =
  | 'data plane'
  | 'the Dock'
  | 'Scuttlebutt'
  | 'the disassembler'
  | 'the SQL upper tier'
  | 'the long tail'
  | 'scheduled'
  | 'deletions';

export interface RouteRecord {
  /** The URL path, with `[param]` segments as the filesystem spells them. */
  path: string;
  state: RouteState;
  workstream: Workstream;
  /** Present when the state is not the obvious one: why it stays, or which issue tracks it. */
  note?: string;
}

/**
 * Routes not served by a `route.ts` in this repo.
 *
 * `/api/whoami` only ever existed in kittiwake, and `/api/support/[number]` was built there from
 * the start: it reads a mirror of graph-support that has no equivalent here, so a Next handler for
 * it could only be a second, worse implementation. Listed so the counts describe the surface the
 * public sees rather than the surface this repo happens to contain.
 */
export const BACKEND_ONLY: readonly string[] = ['/api/whoami', '/api/support/[number]'];

/**
 * Everything that is not migrated, and what it is waiting on.
 *
 * Anything absent from this table and present on disk is assumed migrated, and the test checks
 * that assumption against `MIGRATED` rather than trusting it.
 */
const UNMIGRATED: readonly RouteRecord[] = [
  // ── The Dock: nightswatchhq/kittiwake#16 ──────────────────────────────────
  { path: '/api/studio/auth', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/bounties', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/bounties/[id]', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/deploy-key', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/ipfs/[...path]', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/metadata', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/node', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/subgraphs', state: 'next', workstream: 'the Dock' },
  { path: '/api/studio/subgraphs/[id]', state: 'next', workstream: 'the Dock' },

  // ── Scuttlebutt: a rewrite rather than a port, kittiwake#17 ───────────────
  { path: '/api/scuttlebutt/admin/login', state: 'next', workstream: 'Scuttlebutt' },
  { path: '/api/scuttlebutt/admin/messages', state: 'next', workstream: 'Scuttlebutt' },
  { path: '/api/scuttlebutt/bans', state: 'next', workstream: 'Scuttlebutt' },
  { path: '/api/scuttlebutt/messages', state: 'next', workstream: 'Scuttlebutt' },
  { path: '/api/scuttlebutt/messages/[id]', state: 'next', workstream: 'Scuttlebutt' },
  { path: '/api/scuttlebutt/stream', state: 'next', workstream: 'Scuttlebutt' },

  // ── The disassembler, onto wasmtime with fuel and epoch limits: kittiwake#18
  { path: '/api/disassembly', state: 'next', workstream: 'the disassembler' },
  { path: '/api/disassembly/diff', state: 'next', workstream: 'the disassembler' },
  { path: '/api/disassembly/verify', state: 'next', workstream: 'the disassembler' },

  // ── The SQL upper tier: kittiwake#19. catalog and query are already across. ─
  { path: '/api/sql/receipt', state: 'next', workstream: 'the SQL upper tier' },

  // ── The long tail: kittiwake#20, to be triaged rather than worked through ──
  //
  // Triaged on 2026-09-09 by asking, for each one, whether anything in this repo actually calls
  // it - through the hook, through the component, to a page that mounts it. Six did not, and five
  // of those have since been deleted rather than ported (kittiwake#20).
  //
  // `/api/horizon/debug` was the one that stayed, on the grounds that "no in-repo consumer" is not
  // "nobody reads it" for a public path on a public host. Confirmed with a person on 2026-09-10 and
  // deleted: a TCP-and-TLS probe against ampd is an operator tool, and an operator tool belongs on
  // the box it probes from rather than in the frontend.
  { path: '/api/analytics/clickthrough', state: 'next', workstream: 'the long tail' },
  { path: '/api/data-services/query', state: 'next', workstream: 'the long tail' },
  { path: '/api/indexer/present-poi', state: 'next', workstream: 'the long tail' },

  // ── Staying on Next by decision ───────────────────────────────────────────
  {
    path: '/api/indexing-status/[hash]',
    state: 'staying',
    workstream: 'data plane',
    note: 'pulled back from kittiwake on 7 September. Needs the live serving probe, which signs TAP receipts against funded escrow: the same custody question as kittiwake#11 in different clothes. Stays until the Dock moves.',
  },
  {
    path: '/api/migration',
    state: 'staying',
    workstream: 'data plane',
    note: 'reports on this migration. Proxying it to kittiwake would mean the progress figure went down whenever the thing it measures did.',
  },
  {
    path: '/api/health',
    state: 'staying',
    workstream: 'data plane',
    note: 'judges this deployment, including whether kittiwake is writing. Moving it into kittiwake would make the thing being checked the checker.',
  },
  {
    path: '/api/file-issue',
    state: 'staying',
    workstream: 'the long tail',
    note: 'holds GRAPH_SUPPORT_ISSUE_TOKEN, which writes to a public repository. It sits outside /api/support because everything under that prefix is proxied; moving it to kittiwake would move the credential onto the box that serves the archive it writes to.',
  },
  {
    path: '/api/issue-forms',
    state: 'staying',
    workstream: 'the long tail',
    note: 'the read half of /api/file-issue, split off because the rate limiter buckets by path rather than by method and a write budget is not a read budget. Moves when filing does.',
  },
  {
    path: '/api/provider-liveness',
    state: 'staying',
    workstream: 'the long tail',
    note: 'was marked doomed on the premise that Dispatch was being retired whole. The gateway was; the data service was not. The catalogue entry now reads "Ready · awaiting an operator" and invites strangers to run it, and this probe is what stops that invitation going stale - it answered 2 registered, 0 serving, 2 lying on 2026-09-10. The page claimed "Live · Production" for 39 days once already, which is why this exists (nightswatchhq/lodestar#99).',
  },

  // ── Agreed for deletion, kittiwake#20. Not outstanding work. ──────────────
  //
  // The push and Lodie routes were here and are now gone, along with the UI behind them: the crons
  // that fed push were struck when it was discontinued on 2026-09-06, so the subscribe button was
  // offering people a thing that could no longer notify them. Nothing is left in this block, which
  // is the state it should be in: a route agreed for deletion and not deleted is a claim about the
  // future rather than a description of the present.

  // ── Scheduled endpoints. kittiwake schedules its own; these two have not moved.
  {
    path: '/api/cron/tap-provision',
    state: 'staying',
    workstream: 'scheduled',
    note: 'holds TAP_SIGNER_PRIVATE_KEY and spends GRT. A custody decision rather than a port, kittiwake#11.',
  },
  {
    path: '/api/cron/reconcile-bounties',
    state: 'staying',
    workstream: 'scheduled',
    note: 'reads the BountyBoard contract and updates sync_bounties. Belongs with the Dock, kittiwake#16.',
  },
];


/**
 * Every route the public surface has, with its state.
 *
 * Built from the pieces above rather than typed out again, so the only way to add a route to the
 * inventory is to add it to exactly one of them.
 */
export function buildInventory(routeFilePaths: readonly string[]): RouteRecord[] {
  const declared = new Map(UNMIGRATED.map((r) => [r.path, r]));
  const out: RouteRecord[] = [];

  for (const path of [...routeFilePaths, ...BACKEND_ONLY]) {
    const explicit = declared.get(path);
    if (explicit) {
      out.push(explicit);
      continue;
    }
    out.push({ path, state: 'kittiwake', workstream: 'data plane' });
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Route files in this repo when the goal became "Lodestar is a frontend and nothing else".
 *
 * A percentage needs a fixed denominator, and every other candidate shrinks as work lands: a share
 * of what is left is always 100%. This is the count on 2026-09-10, the day the ten descheduled cron
 * handlers were deleted, and it is a constant on purpose. It says how far we have come from a fixed
 * point rather than how much of the current backlog is done, which is the question that flatters.
 */
export const ROUTES_AT_BASELINE = 93;

export interface MigrationSummary {
  /** Public read surface: everything except crons and routes already agreed for deletion. */
  inScope: number;
  onKittiwake: number;
  onNext: number;
  stayingOnNext: number;
  /** Of the in-scope surface, the share kittiwake serves, 0-100 and rounded. */
  percent: number;
  /** Not counted in `inScope`, reported separately so the denominator is honest. */
  doomed: number;
  scheduled: number;
  /** Route files still in this repo. The goal is zero: everything here is a thing a frontend holds. */
  remaining: number;
  /** How far from [`ROUTES_AT_BASELINE`] to zero, 0-100 and rounded. */
  percentToFrontend: number;
  byWorkstream: { workstream: Workstream; total: number; onKittiwake: number; onNext: number }[];
}

/**
 * The numbers the panel shows.
 *
 * `staying` counts as neither done nor outstanding in `percent`: it is out of scope by decision,
 * and folding it into either number would make the figure a claim about something else. It is
 * reported on its own so the reader can see what the denominator excludes.
 */
export function summarise(inventory: readonly RouteRecord[]): MigrationSummary {
  // Everything with a handler in this repo, whatever its state. A route that stays by decision is
  // still a route this repo serves, and the target counts it.
  const remaining = inventory.filter((r) => r.state !== 'kittiwake').length;
  const public_ = inventory.filter((r) => r.state !== 'cron' && r.workstream !== 'scheduled');
  const inScopeRecords = public_.filter((r) => r.state === 'kittiwake' || r.state === 'next');

  const onKittiwake = inScopeRecords.filter((r) => r.state === 'kittiwake').length;
  const onNext = inScopeRecords.filter((r) => r.state === 'next').length;
  const inScope = onKittiwake + onNext;

  const streams = new Map<Workstream, { total: number; onKittiwake: number; onNext: number }>();
  for (const r of inScopeRecords) {
    const s = streams.get(r.workstream) ?? { total: 0, onKittiwake: 0, onNext: 0 };
    s.total += 1;
    if (r.state === 'kittiwake') s.onKittiwake += 1;
    else s.onNext += 1;
    streams.set(r.workstream, s);
  }

  return {
    inScope,
    onKittiwake,
    onNext,
    stayingOnNext: public_.filter((r) => r.state === 'staying').length,
    percent: inScope === 0 ? 0 : Math.round((onKittiwake / inScope) * 100),
    doomed: public_.filter((r) => r.state === 'doomed').length,
    scheduled: inventory.filter((r) => r.workstream === 'scheduled').length,
    remaining,
    percentToFrontend: Math.round(
      ((ROUTES_AT_BASELINE - remaining) / ROUTES_AT_BASELINE) * 100,
    ),
    byWorkstream: [...streams.entries()]
      .map(([workstream, s]) => ({ workstream, ...s }))
      .sort((a, b) => b.onNext - a.onNext || a.workstream.localeCompare(b.workstream)),
  };
}
