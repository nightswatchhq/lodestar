/**
 * The distinctions this file exists to keep apart.
 *
 * `stale` (it stopped running), `failing` (it runs on time and errors), and `retired` (it was
 * decommissioned on purpose) are three different situations with three different responses. The
 * health endpoint used to publish one undifferentiated list of timestamps, which is how a job folded
 * into another one sat there for 28 days looking broken.
 */
import { describe, it, expect } from 'vitest';
import {
  CRON_EXPECTATIONS,
  RETIRED_CRONS,
  assessCrons,
  staleCrons,
  failingCrons,
  supersededIngestionKeys,
  type CronRunRow,
} from '../cron-expectations';

const NOW = Date.parse('2026-08-29T18:45:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

/** The enrichment pass, whatever it is currently called. It moved from the platform to kittiwake. */
const REFRESH = 'kittiwake:refresh';

const row = (step: string, m: number, success = true): CronRunRow => ({
  step,
  started_at: minutesAgo(m),
  duration_ms: 1000,
  success,
});

describe('the declared set', () => {
  it('has no duplicates and no step that is both expected and retired', () => {
    const steps = CRON_EXPECTATIONS.map((e) => e.step);
    expect(new Set(steps).size).toBe(steps.length);
    for (const s of steps) {
      expect(RETIRED_CRONS[s], `${s} is both expected and retired`).toBeUndefined();
    }
  });

  it('gives every step a window well clear of its schedule, so one missed tick is not an alarm', () => {
    for (const e of CRON_EXPECTATIONS) {
      expect(e.staleAfterMinutes, e.step).toBeGreaterThanOrEqual(20);
      expect(e.what.length, `${e.step} needs a description a reader can act on`).toBeGreaterThan(10);
    }
  });
});

describe('assessCrons', () => {
  it('calls a punctual step healthy', () => {
    const [r] = assessCrons([row(REFRESH, 5)], NOW).filter((s) => s.step === REFRESH);
    expect(r.stale).toBe(false);
    expect(r.ageMinutes).toBe(5);
    expect(r.where).toBe('kittiwake');
  });

  it('calls a step past its window stale', () => {
    const [r] = assessCrons([row(REFRESH, 120)], NOW).filter((s) => s.step === REFRESH);
    expect(r.stale).toBe(true);
    expect(r.ageMinutes).toBe(120);
  });

  // "Never ran" and "stopped running" are both reasons to look. Reporting the first as silence
  // would hide a job that was scheduled and never fired once.
  it('treats a declared step with no row at all as stale, not absent', () => {
    const r = assessCrons([], NOW).find((s) => s.step === REFRESH)!;
    expect(r.stale).toBe(true);
    expect(r.lastRun).toBeNull();
    expect(r.ageMinutes).toBeNull();
  });

  // The finding that prompted all of this.
  it('explains a retired step instead of letting it read as broken', () => {
    const r = assessCrons([row('compute-scores', 40_000)], NOW).find(
      (s) => s.step === 'compute-scores'
    )!;
    expect(r.retired).toContain('refresh');
    expect(r.stale).toBe(false);
    expect(staleCrons(assessCrons([row('compute-scores', 40_000)], NOW))).toHaveLength(
      // Every declared step is missing from this input, so all of them are stale — but the retired
      // one is not among them, which is the whole point.
      CRON_EXPECTATIONS.length
    );
  });

  it('surfaces an undeclared step rather than dropping it', () => {
    const r = assessCrons([row('something-new', 3)], NOW).find((s) => s.step === 'something-new')!;
    expect(r.retired).toBe('not declared in CRON_EXPECTATIONS');
  });

  // A job that runs punctually and errors every time is not stale. Conflating the two would hide it.
  it('keeps failing separate from stale', () => {
    const statuses = assessCrons([row(REFRESH, 2, false)], NOW);
    const refresh = statuses.find((s) => s.step === REFRESH)!;
    expect(refresh.stale).toBe(false);
    expect(refresh.success).toBe(false);
    expect(failingCrons(statuses).map((s) => s.step)).toContain(REFRESH);
    expect(staleCrons(statuses).map((s) => s.step)).not.toContain(REFRESH);
  });

  it('reports every declared step even when the table is empty', () => {
    const statuses = assessCrons([], NOW);
    expect(statuses.map((s) => s.step)).toEqual(
      expect.arrayContaining(CRON_EXPECTATIONS.map((e) => e.step))
    );
  });

  /**
   * The state production was actually in when this was written, kept as a regression: everything
   * punctual except one retired step. If a future change makes this report anything stale, either
   * a cadence is wrong or something genuinely broke.
   */
  it('reports the real production shape as healthy, with the retirements explained', () => {
    const real: CronRunRow[] = [
      // kittiwake's scheduler, the only writer of these since 2026-09-07.
      row('kittiwake:refresh', 5),
      row('kittiwake:snapshot-network', 0),
      row('kittiwake:ingest-epochs', 5),
      row('kittiwake:ingest-delegations', 0),
      row('kittiwake:ingest-allocations', 44),
      row('kittiwake:ingest-disputes', 42),
      row('kittiwake:ingest-rav', 25),
      row('kittiwake:ingest-horizon-activity', 1),
      row('kittiwake:refresh-chain-health', 12),
      row('kittiwake:warm-ipfs', 6),
      row('kittiwake:warm', 0),
      // The two that stay on the platform: a signing key and the Dock's bounty lifecycle.
      row('tap-provision', 3),
      row('reconcile-bounties', 8),
      // History. None of these should read as a job that stopped.
      row('compute-scores', 40_000),
      row('refresh', 200),
      row('snapshot', 200),
      row('epochs', 200),
      row('delegations', 200),
      row('allocations', 200),
      row('disputes', 400),
      row('rav', 500),
      row('check-dips', 200),
      row('check-dips-chain', 200),
      row('check-nest-health', 200),
      row('check-provider-liveness', 200),
      row('dispatch-notifications', 200),
    ];
    const statuses = assessCrons(real, NOW);
    expect(staleCrons(statuses)).toEqual([]);
    expect(failingCrons(statuses)).toEqual([]);
    expect(statuses.find((s) => s.step === 'compute-scores')!.retired).toBeTruthy();
  });

  /**
   * The specific regression this change fixes. Five crons were deleted from vercel.json in
   * b2f7273 and left declared here, so /api/health reported four permanently stale jobs that had
   * been removed on purpose. A deleted cron must be retired, not merely undeclared: undeclared
   * would hide a genuine stray.
   */
  it('treats the crons deleted with the Dispatch gateway as retired rather than stale', () => {
    const deleted = [
      'check-dips',
      'check-dips-chain',
      'check-nest-health',
      'check-provider-liveness',
      'dispatch-notifications',
    ];
    const statuses = assessCrons(deleted.map((d) => row(d, 5_000)), NOW);
    for (const d of deleted) {
      const r = statuses.find((s) => s.step === d)!;
      expect(r.retired, `${d} still reads as a live job`).toBeTruthy();
      expect(r.retired).not.toBe('not declared in CRON_EXPECTATIONS');
      expect(r.stale).toBe(false);
    }
    expect(staleCrons(statuses).map((s) => s.step)).toEqual(
      expect.not.arrayContaining(deleted)
    );
  });

  /**
   * The two-writer state kittiwake#1 warns about, made visible. Every unprefixed ingest step now
   * has a `kittiwake:` counterpart; if an unprefixed one starts writing again, something on the
   * platform has been re-enabled and both are writing the same tables.
   */
  it('declares the kittiwake step for every retired platform ingest step', () => {
    const moved = ['refresh', 'snapshot', 'delegations', 'epochs', 'allocations', 'disputes', 'rav'];
    for (const m of moved) {
      expect(RETIRED_CRONS[m], `${m} should be retired`).toBeTruthy();
      expect(RETIRED_CRONS[m]).toContain('kittiwake:');
      const named = RETIRED_CRONS[m].match(/kittiwake:[a-z-]+/)![0];
      expect(
        CRON_EXPECTATIONS.some((e) => e.step === named),
        `${m} points at ${named}, which is not declared`
      ).toBe(true);
    }
  });
});

/**
 * The platform crons stopped on purpose on 2026-09-07, so their `ingestion_state` rows stopped
 * advancing. Judging them would leave /api/health permanently degraded over rows nobody intends to
 * write again - the retired-cron problem wearing different clothes.
 */
describe('supersededIngestionKeys', () => {
  it('supersedes an unprefixed feed once kittiwake writes the same one', () => {
    const s = supersededIngestionKeys(['rav', 'kittiwake:rav', 'epochs', 'kittiwake:epochs']);
    expect([...s].sort()).toEqual(['epochs', 'rav']);
  });

  it('keeps judging a feed whose kittiwake counterpart is missing', () => {
    // The important half. If kittiwake stops writing one, the frozen old row must not quietly
    // start covering for it.
    const s = supersededIngestionKeys(['rav', 'kittiwake:rav', 'disputes']);
    expect(s.has('disputes')).toBe(false);
    expect(s.has('rav')).toBe(true);
  });

  it('never supersedes a kittiwake row itself', () => {
    const s = supersededIngestionKeys(['kittiwake:rav', 'rav']);
    expect(s.has('kittiwake:rav')).toBe(false);
  });

  it('is empty when nothing has moved', () => {
    expect(supersededIngestionKeys(['rav', 'epochs']).size).toBe(0);
  });
});
