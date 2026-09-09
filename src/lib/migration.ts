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
 */
export const MIGRATED: readonly string[] = [
  '/api/apr-provenance/',
  '/api/chain-lag',
  '/api/curators',
  '/api/delegation-events',
  '/api/delegation-flows',
  '/api/developer-activity',
  '/api/dips',
  '/api/dropped-chains',
  '/api/epochs',
  '/api/grt-flow',
  '/api/horizon/activity',
  '/api/indexer-node-health',
  '/api/indexer-stake-history/',
  '/api/indexer-status/',
  '/api/indexer/',
  '/api/indexers',
  '/api/indexers-enriched',
  '/api/network-stats',
  '/api/payments',
  '/api/poi',
  '/api/portfolio',
  '/api/price',
  '/api/provisions',
  '/api/reo',
  '/api/rewards-history',
  '/api/sql/catalog',
  '/api/sql/query',
  '/api/subgraph-curation/',
  '/api/subgraph-deployments',
  '/api/subgraph-fees-30d',
  '/api/subgraph-history/',
  '/api/subgraph-names',
  '/api/subgraph-search',
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
 * Every parameterised entry in the list takes a single parameter, so one segment is the rule the
 * routes actually have. If a genuinely nested route is migrated later it needs its own entry, and
 * that is the right amount of friction for something this easy to get wrong.
 */
export function isMigrated(path: string): boolean {
  if (NEVER_FORWARD.includes(path)) return false;
  return MIGRATED.some((p) => {
    if (!p.endsWith('/')) return path === p;
    if (!path.startsWith(p)) return false;
    const rest = path.slice(p.length);
    return rest.length > 0 && !rest.includes('/');
  });
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
 * `/api/whoami` only ever existed in kittiwake. Listed so the counts describe the surface the
 * public sees rather than the surface this repo happens to contain.
 */
const BACKEND_ONLY: readonly string[] = ['/api/whoami'];

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
  { path: '/api/sql/named', state: 'next', workstream: 'the SQL upper tier' },
  { path: '/api/sql/receipt', state: 'next', workstream: 'the SQL upper tier' },

  // ── The long tail: kittiwake#20, to be triaged rather than worked through ──
  //
  // Triaged on 2026-09-09 by asking, for each one, whether anything in this repo actually calls
  // it - through the hook, through the component, to a page that mounts it. Six did not, and five
  // of those have since been deleted rather than ported (kittiwake#20).
  //
  // `/api/horizon/debug` is the one that stayed. Its only reference is its own auth test, but it is
  // cron-authed, which is what an operator tool looks like rather than what dead code looks like -
  // and "no in-repo consumer" is not "nobody reads it" for a public path on a public host. It wants
  // confirming with a person before it goes.
  { path: '/api/analytics/clickthrough', state: 'next', workstream: 'the long tail' },
  { path: '/api/blog/search-index', state: 'next', workstream: 'the long tail' },
  { path: '/api/data-services/query', state: 'next', workstream: 'the long tail' },
  { path: '/api/delegate/recommend', state: 'next', workstream: 'the long tail' },
  { path: '/api/dips/agreements', state: 'next', workstream: 'the long tail' },
  { path: '/api/ens', state: 'next', workstream: 'the long tail' },
  { path: '/api/feed', state: 'next', workstream: 'the long tail' },
  { path: '/api/foghorn/[...path]', state: 'next', workstream: 'the long tail', note: 'a proxy; check it still needs to be one now both services sit on the same box' },
  { path: '/api/horizon/debug', state: 'next', workstream: 'the long tail', note: 'no in-repo consumer beyond its auth test. Cron-authed, so possibly curled by hand; confirm before deleting. kittiwake#20.' },
  { path: '/api/indexer-disputes/[address]', state: 'next', workstream: 'the long tail' },
  { path: '/api/indexer/present-poi', state: 'next', workstream: 'the long tail' },
  { path: '/api/indexer/[address]/pnl', state: 'next', workstream: 'the long tail' },
  { path: '/api/indexer/[address]/revenue', state: 'next', workstream: 'the long tail' },
  { path: '/api/manifest', state: 'next', workstream: 'the long tail' },
  { path: '/api/operator-preflight', state: 'next', workstream: 'the long tail' },
  { path: '/api/parameter-history/[address]', state: 'next', workstream: 'the long tail' },
  { path: '/api/qos/capture', state: 'next', workstream: 'the long tail' },
  { path: '/api/service-census', state: 'next', workstream: 'the long tail' },
  { path: '/api/subgraph-schema/[hash]', state: 'next', workstream: 'the long tail' },
  { path: '/api/subgraph-versions/[hash]', state: 'next', workstream: 'the long tail' },
  { path: '/api/support', state: 'next', workstream: 'the long tail' },

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

  // ── Agreed for deletion, kittiwake#20. Not outstanding work. ──────────────
  //
  // The push and Lodie routes were here and are now gone, along with the UI behind them: the crons
  // that fed push were struck when it was discontinued on 2026-09-06, so the subscribe button was
  // offering people a thing that could no longer notify them. `provider-liveness` is the last one
  // standing and goes with the Dispatch removal, #99.
  { path: '/api/provider-liveness', state: 'doomed', workstream: 'deletions', note: 'goes with the Dispatch removal, nightswatchhq/lodestar#99' },

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
 * Cron routes whose schedule moved to kittiwake on 7 September.
 *
 * The handlers still exist and are deliberately no longer scheduled: they are the rollback. If
 * kittiwake's scheduler has to be turned off, putting these back in `vercel.json` restores the old
 * behaviour without a revert. Delete them only once that is no longer wanted.
 */
const DESCHEDULED_CRONS: readonly string[] = [
  '/api/cron/ingest-allocations',
  '/api/cron/ingest-delegations',
  '/api/cron/ingest-disputes',
  '/api/cron/ingest-epochs',
  '/api/cron/ingest-horizon-activity',
  '/api/cron/ingest-rav',
  '/api/cron/refresh',
  '/api/cron/refresh-chain-health',
  '/api/cron/snapshot-network',
  '/api/cron/warm-ipfs',
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
    if (DESCHEDULED_CRONS.includes(path)) {
      out.push({
        path,
        state: 'cron',
        workstream: 'scheduled',
        note: 'descheduled on 7 September; kittiwake runs it. Handler kept as the rollback.',
      });
      continue;
    }
    out.push({ path, state: 'kittiwake', workstream: 'data plane' });
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

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
    byWorkstream: [...streams.entries()]
      .map(([workstream, s]) => ({ workstream, ...s }))
      .sort((a, b) => b.onNext - a.onNext || a.workstream.localeCompare(b.workstream)),
  };
}
