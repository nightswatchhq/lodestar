import type { DbClient } from './db';
import { log } from './logger';

interface CronRunResult {
  step: string;
  startedAt: Date;
  durationMs: number;
  rowsAffected?: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * Record a cron run in the cron_runs table.
 * Best-effort — logs a warning if the insert fails but never throws.
 */
export async function recordCronRun(
  sql: DbClient,
  result: CronRunResult
): Promise<void> {
  try {
    await sql`
      INSERT INTO cron_runs (step, started_at, duration_ms, rows_affected, success, error_message)
      VALUES (
        ${result.step},
        ${result.startedAt.toISOString()},
        ${result.durationMs},
        ${result.rowsAffected ?? null},
        ${result.success},
        ${result.errorMessage ?? null}
      )
    `;
  } catch (e) {
    log.cron.warn({ err: e, step: result.step }, 'Failed to record cron run');
  }
}

/**
 * Wrap a cron step function — times it, records the result, returns it.
 */
export async function withCronTracking<T extends { ingested?: number; count?: number }>(
  sql: DbClient,
  step: string,
  fn: () => Promise<T>
): Promise<T & { durationMs: number }> {
  const startedAt = new Date();
  const start = Date.now();

  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const rowsAffected = result.ingested ?? result.count ?? undefined;

    await recordCronRun(sql, {
      step,
      startedAt,
      durationMs,
      rowsAffected,
      success: true,
    });

    return { ...result, durationMs };
  } catch (e) {
    const durationMs = Date.now() - start;

    await recordCronRun(sql, {
      step,
      startedAt,
      durationMs,
      success: false,
      errorMessage: String(e),
    });

    throw e;
  }
}

/**
 * Record that a cron completed, without ever being able to break it.
 *
 * `tap-provision` and `reconcile-bounties` never wrote a `cron_runs` row, so `/api/health` had no
 * way to tell "ran and did nothing" from "has not run since August". That matters most for
 * `tap-provision`, which spends GRT every five minutes with a signing key and was doing so
 * unobserved.
 *
 * Deliberately not `withCronTracking`: these handlers have several early returns and one of them
 * moves money, so this is an additive call on the paths that finished rather than a restructuring.
 * The catch is the point - a failure to write the audit row must never fail the run itself.
 */
export async function noteCronRun(
  sql: DbClient,
  step: string,
  startedAt: Date,
  rowsAffected?: number,
): Promise<void> {
  try {
    await recordCronRun(sql, {
      step,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
      rowsAffected,
      success: true,
    });
  } catch {
    // Swallowed on purpose. See above.
  }
}
