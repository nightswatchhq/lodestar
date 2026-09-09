// What each cron step is supposed to do, and how late is too late.
//
// `/api/health` used to report `cron_runs` as a bare list of last-run timestamps: every step that
// ever ran, newest row per step, no judgement. Two things were wrong with that, and the second is
// the one that matters.
//
// **A retired step lingers forever looking broken.** `compute-scores` last ran on 1 August and
// showed up next to jobs that ran minutes ago. It is not broken; it was folded into `refresh` and
// the switch case removed. But a reader — including me, an hour ago — sees a 28-day-old timestamp
// and concludes a job has stopped. A monitoring surface that cries wolf about a decommissioned job
// teaches people to ignore staleness in that table, and the next genuinely stopped cron goes with
// it.
//
// **Nothing computed staleness at all.** The endpoint published `last_run` and left the reader to
// know each job's cadence from memory. That is the same shape as reading a registry and calling it
// liveness: the data is there and the judgement is not, so the failure is silent until somebody
// happens to look and happens to know.
//
// So: declare the cadence, declare what is retired, and let the endpoint say `stale: true` rather
// than making every reader do the arithmetic.

export interface CronExpectation {
  /** The `step` name written to `cron_runs`. */
  step: string;
  /**
   * How long after its last run a step is late, in minutes.
   *
   * Generous on purpose — roughly three times the schedule — because a single missed tick is a
   * blip and an alert that fires on blips is an alert nobody reads. This is for "it stopped", not
   * for "it was slow once".
   */
  staleAfterMinutes: number;
  /** Where it is scheduled, because the answer changes where you go to fix it. */
  where: 'vercel' | 'kittiwake';
  what: string;
}

/**
 * Steps that used to run and deliberately no longer do.
 *
 * Listed rather than deleted from the table: their rows stay in `cron_runs` as history, and naming
 * them here is what stops that history reading as a fault. Removing the row would lose the record;
 * leaving it unexplained is what caused the confusion.
 */
export const RETIRED_CRONS: Record<string, string> = {
  'compute-scores':
    'folded into `refresh`, which computes the composite score in the same pass. The runner has no such case any more.',

  // Removed from vercel.json in b2f7273 with the Dispatch gateway, and left declared here, so
  // /api/health reported four permanently stale crons that had in fact been deleted on purpose.
  // Exactly the `compute-scores` failure again, five weeks later.
  'check-provider-liveness':
    'watched Dispatch RPC providers. Deleted with the Dispatch gateway (nightswatchhq/lodestar#99); there are no providers left to watch.',
  'dispatch-notifications':
    'push notifications for the Dispatch gateway, discontinued along with push itself.',
  'check-dips':
    'watched the DIPS allocation for the governance change that turns it on. Superseded by dips-nest, which indexes the contracts directly.',
  'check-dips-chain':
    'compared the DIPS nest against the allocator it indexes. Retired with check-dips.',
  'check-nest-health':
    'watched the nuthatch nests this dashboard stands on. Deleted in b2f7273. NOTE: nothing replaced it, and the nests have been unwatched since 2026-09-07 14:45 — see nightswatchhq/nuthatch#1199, a stalled seal that this check would not have caught anyway because it read /ready, which cannot distinguish a stalled seal from a healthy one.',

  // The old unprefixed steps. Everything below now runs inside kittiwake under a `kittiwake:`
  // name; these rows are history and must not read as a job that stopped.
  refresh: 'moved into kittiwake as `kittiwake:refresh`.',
  snapshot: 'moved into kittiwake as `kittiwake:snapshot-network`.',
  delegations: 'moved into kittiwake as `kittiwake:ingest-delegations`.',
  epochs: 'moved into kittiwake as `kittiwake:ingest-epochs`.',
  allocations: 'moved into kittiwake as `kittiwake:ingest-allocations`.',
  disputes: 'moved into kittiwake as `kittiwake:ingest-disputes`.',
  rav: 'moved into kittiwake as `kittiwake:ingest-rav`.',
};

export const CRON_EXPECTATIONS: CronExpectation[] = [
  // ── kittiwake's scheduler (crates/kittiwake-bin/src/jobs.rs) ──────────────
  //
  // These were Vercel crons until 2026-09-07 and are now kittiwake's, writing under a
  // `kittiwake:` prefix. For a few hours both wrote the same tables, which is the two-writer
  // state kittiwake#1 exists to prevent; the vercel.json entries were removed in the same change
  // as this table, so there is one writer again.
  //
  // Windows are roughly three times the job's own interval, as above.
  { step: 'kittiwake:refresh', staleAfterMinutes: 20, where: 'kittiwake', what: 'the enrichment pipeline, and where indexer composite scores are computed' },
  { step: 'kittiwake:snapshot-network', staleAfterMinutes: 20, where: 'kittiwake', what: 'network snapshot' },
  { step: 'kittiwake:ingest-epochs', staleAfterMinutes: 45, where: 'kittiwake', what: 'epoch ingestion' },
  { step: 'kittiwake:ingest-delegations', staleAfterMinutes: 60, where: 'kittiwake', what: 'delegation events' },
  { step: 'kittiwake:ingest-allocations', staleAfterMinutes: 180, where: 'kittiwake', what: 'allocation deltas' },
  { step: 'kittiwake:ingest-disputes', staleAfterMinutes: 1080, where: 'kittiwake', what: 'disputes, every six hours' },
  { step: 'kittiwake:ingest-rav', staleAfterMinutes: 180, where: 'kittiwake', what: 'RAV ingestion' },
  { step: 'kittiwake:ingest-horizon-activity', staleAfterMinutes: 20, where: 'kittiwake', what: 'Horizon provision and thaw activity; runs every two minutes, so this window is ten ticks rather than three - the floor in the test is what sets it' },
  { step: 'kittiwake:refresh-chain-health', staleAfterMinutes: 100, where: 'kittiwake', what: 'the indexer chain-health probe' },
  { step: 'kittiwake:warm-ipfs', staleAfterMinutes: 40, where: 'kittiwake', what: 'fetches subgraph metadata so a subgraph is findable by name' },
  { step: 'kittiwake:warm', staleAfterMinutes: 20, where: 'kittiwake', what: 'the response cache warmer; fires every minute by definition, so the 20-minute floor applies rather than a multiple of its schedule' },

  // ── Vercel crons (vercel.json) ────────────────────────────────────────────
  //
  // The two that did not move. `tap-provision` holds a signing key and spends GRT, which is a
  // custody decision rather than a port (kittiwake#11); `reconcile-bounties` belongs with the Dock
  // (kittiwake#16). Both stay here until those are settled.
  { step: 'tap-provision', staleAfterMinutes: 20, where: 'vercel', what: 'tops up TAP escrow for claimed bounties; holds the signer key' },
  { step: 'reconcile-bounties', staleAfterMinutes: 40, where: 'vercel', what: 'reads the BountyBoard contract and updates sync_bounties' },
];

export interface CronStatus {
  step: string;
  lastRun: string | null;
  durationMs: number | null;
  success: boolean | null;
  /** Later than its declared window, or never seen at all. */
  stale: boolean;
  ageMinutes: number | null;
  where?: 'vercel' | 'kittiwake';
  what?: string;
  /** Present only for a step in `RETIRED_CRONS`, and it explains itself. */
  retired?: string;
}

export interface CronRunRow {
  step: string;
  started_at: string | Date;
  duration_ms: number | null;
  success: boolean;
}

/**
 * Turn raw rows into a verdict.
 *
 * A declared step with no row at all is stale, not absent: "it has never run" and "it stopped" are
 * both reasons to look, and reporting the first as silence would hide a job that was scheduled and
 * never fired once.
 */
export function assessCrons(rows: CronRunRow[], now = Date.now()): CronStatus[] {
  const byStep = new Map(rows.map((r) => [r.step, r]));
  const out: CronStatus[] = [];

  for (const exp of CRON_EXPECTATIONS) {
    const row = byStep.get(exp.step);
    const lastRun = row ? new Date(row.started_at) : null;
    const ageMinutes = lastRun ? Math.round((now - lastRun.getTime()) / 60_000) : null;
    out.push({
      step: exp.step,
      lastRun: lastRun ? lastRun.toISOString() : null,
      durationMs: row?.duration_ms ?? null,
      success: row?.success ?? null,
      // A step whose last run failed is not stale, it is failing — a different thing, reported by
      // `success`. Conflating them would hide a job that runs punctually and errors every time.
      stale: ageMinutes === null || ageMinutes > exp.staleAfterMinutes,
      ageMinutes,
      where: exp.where,
      what: exp.what,
    });
  }

  // Anything in the table that nobody declared. Retired steps explain themselves; a genuinely
  // unknown one is surfaced rather than dropped, because a step writing rows that no expectation
  // covers is either a new job nobody registered here or a stray, and both are worth seeing.
  for (const row of rows) {
    if (CRON_EXPECTATIONS.some((e) => e.step === row.step)) continue;
    const lastRun = new Date(row.started_at);
    out.push({
      step: row.step,
      lastRun: lastRun.toISOString(),
      durationMs: row.duration_ms,
      success: row.success,
      stale: false,
      ageMinutes: Math.round((now - lastRun.getTime()) / 60_000),
      retired: RETIRED_CRONS[row.step] ?? 'not declared in CRON_EXPECTATIONS',
    });
  }

  return out;
}

/** The steps a reader should go and look at. */
export function staleCrons(statuses: CronStatus[]): CronStatus[] {
  return statuses.filter((s) => s.stale && !s.retired);
}

/** The steps that ran on time and failed, which is a different fault entirely. */
export function failingCrons(statuses: CronStatus[]): CronStatus[] {
  return statuses.filter((s) => !s.stale && s.success === false);
}

/**
 * A `kittiwake:`-prefixed ingestion key supersedes its unprefixed twin.
 *
 * The platform crons were removed on 2026-09-07, so the unprefixed rows in `ingestion_state`
 * stopped advancing and would have read as a stalled pipeline for ever while kittiwake wrote the
 * same tables perfectly. Same shape as the retired-cron problem: a row that stops on purpose has to
 * be told apart from one that stops by accident, or the surface cries wolf and the next real
 * stoppage goes with it.
 *
 * Deliberately keyed on the presence of the newer row rather than on a hardcoded list, so a key
 * whose kittiwake counterpart is missing keeps being judged. If kittiwake stops writing one, the
 * old row does not quietly start covering for it.
 */
export const KITTIWAKE_PREFIX = 'kittiwake:';

export function supersededIngestionKeys(keys: readonly string[]): Set<string> {
  const owned = new Set(
    keys.filter((k) => k.startsWith(KITTIWAKE_PREFIX)).map((k) => k.slice(KITTIWAKE_PREFIX.length)),
  );
  return new Set(keys.filter((k) => !k.startsWith(KITTIWAKE_PREFIX) && owned.has(k)));
}
