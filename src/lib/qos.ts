import type { IndexerQosPoint } from '@/lib/contracts/indexer-qos';
import type { FoghornQosBucket } from '@/lib/foghorn';

export const BUCKETS_PER_DAY = 288;

/** Foghorn keeps 30 days of buckets and caps one read at 5,000 rows. */
export const FOGHORN_HOURS = 720;
export const FOGHORN_BUCKET_LIMIT = 5000;

/** The publisher posts every five minutes and lands about half an hour behind its bucket. */
export const PUBLISHER_SILENT_AFTER_SECONDS = 60 * 60;

export type QosGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/** The retired panel's thresholds, which kittiwake's port keeps. */
export function qosGrade(q: number): { grade: QosGrade; variant: 'success' | 'accent' | 'warning' | 'error' } {
  if (q >= 75) return { grade: 'A', variant: 'success' };
  if (q >= 60) return { grade: 'B', variant: 'accent' };
  if (q >= 45) return { grade: 'C', variant: 'warning' };
  if (q >= 30) return { grade: 'D', variant: 'warning' };
  return { grade: 'F', variant: 'error' };
}

/** Every UTC day in a window of `days`, oldest first, today last. */
export function windowDays(days: number, nowMs = Date.now()): string[] {
  const today = Math.floor(nowMs / 86_400_000);
  return Array.from({ length: days }, (_, i) =>
    new Date((today - (days - 1) + i) * 86_400_000).toISOString().slice(0, 10),
  );
}

/** One of Foghorn's days, kept as sums so a window can be recombined from them. */
export interface FoghornDay {
  date: string;
  probes: number;
  ok: number;
  latencyWeighted: number;
  latencyWeight: number;
  comparable: number;
  divergent: number;
}

export interface FoghornFigures {
  probes: number;
  /** 0 to 100, or null when nothing answered. */
  successRate: number | null;
  /** Mean over successful probes, as Foghorn weights its own. */
  latencyMs: number | null;
  /** 0 to 100, or null when nothing was comparable. Never read null as 100. */
  correctnessRate: number | null;
  comparable: number;
}

export function foghornFigures(d: Omit<FoghornDay, 'date'>): FoghornFigures {
  return {
    probes: d.probes,
    successRate: d.probes > 0 ? (d.ok / d.probes) * 100 : null,
    latencyMs: d.latencyWeight > 0 ? d.latencyWeighted / d.latencyWeight : null,
    correctnessRate: d.comparable > 0 ? (1 - d.divergent / d.comparable) * 100 : null,
    comparable: d.comparable,
  };
}

/**
 * Foghorn's five-minute buckets folded into UTC days.
 *
 * Buckets arrive newest first, so a read that hit the row cap is missing the oldest end: the
 * oldest day it reached is dropped rather than drawn from a fraction of its buckets.
 */
export function foghornDaily(buckets: FoghornQosBucket[], truncated: boolean): Map<string, FoghornDay> {
  const days = new Map<string, FoghornDay>();
  for (const b of buckets) {
    const date = new Date(b.bucket_start).toISOString().slice(0, 10);
    const d = days.get(date) ?? { date, probes: 0, ok: 0, latencyWeighted: 0, latencyWeight: 0, comparable: 0, divergent: 0 };
    d.probes += b.query_count;
    d.ok += b.num_indexer_200_responses;
    if (b.avg_indexer_latency_ms != null && b.num_indexer_200_responses > 0) {
      d.latencyWeighted += b.avg_indexer_latency_ms * b.num_indexer_200_responses;
      d.latencyWeight += b.num_indexer_200_responses;
    }
    d.comparable += b.comparable_count;
    d.divergent += b.divergent_count;
    days.set(date, d);
  }
  if (truncated && days.size > 0) {
    days.delete([...days.keys()].sort()[0]);
  }
  return days;
}

export function foghornWindow(days: Iterable<FoghornDay>): FoghornFigures {
  const sum = { probes: 0, ok: 0, latencyWeighted: 0, latencyWeight: 0, comparable: 0, divergent: 0 };
  for (const d of days) {
    sum.probes += d.probes;
    sum.ok += d.ok;
    sum.latencyWeighted += d.latencyWeighted;
    sum.latencyWeight += d.latencyWeight;
    sum.comparable += d.comparable;
    sum.divergent += d.divergent;
  }
  return foghornFigures(sum);
}

export interface ChartDay {
  date: string;
  measured: boolean;
  partial: boolean;
  buckets: number | null;
  queryCount: number | null;
  totalQueryFees: number | null;
  avgQueryFee: number | null;
  successRate: number | null;
  latencyMs: number | null;
  secondsBehind: number | null;
  probeSuccessRate: number | null;
  probeLatencyMs: number | null;
  probeCorrectnessRate: number | null;
}

/** Every day of the window, with nulls where nothing was posted so a chart draws a gap. */
export function chartSeries(points: IndexerQosPoint[], days: string[], foghorn: Map<string, FoghornDay>): ChartDay[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
  return days.map((date) => {
    const p = byDate.get(date);
    const f = foghorn.get(date);
    const probe = f ? foghornFigures(f) : null;
    return {
      date,
      measured: !!p,
      partial: !!p && p.partial,
      buckets: p ? p.buckets : null,
      queryCount: p?.queryCount ?? null,
      totalQueryFees: p?.totalQueryFees ?? null,
      avgQueryFee: p?.avgQueryFee ?? null,
      successRate: p?.successRate ?? null,
      latencyMs: p?.latencyMs ?? null,
      secondsBehind: p?.secondsBehind ?? null,
      probeSuccessRate: probe?.successRate ?? null,
      probeLatencyMs: probe?.latencyMs ?? null,
      probeCorrectnessRate: probe?.correctnessRate ?? null,
    };
  });
}

/** A day's queries that had peers to be behind; the nest leaves deployments without three credible peers out. */
function comparedQueries(p: IndexerQosPoint): number {
  return (p.queryCount ?? 0) * (p.shareWithBlockTime ?? 0);
}

/** Share of the window's compared queries that ran more than five minutes behind their peers. */
export function shareOver5Min(points: IndexerQosPoint[]): number | null {
  let weighted = 0;
  let weight = 0;
  for (const p of points) {
    if (p.shareQueriesOver5MinBehind == null) continue;
    const compared = comparedQueries(p);
    weighted += p.shareQueriesOver5MinBehind * compared;
    weight += compared;
  }
  return weight > 0 ? weighted / weight : null;
}

/** Share of the window's queries that Behind Freshest Peer could be measured on. */
export function shareCompared(points: IndexerQosPoint[]): number | null {
  let compared = 0;
  let total = 0;
  for (const p of points) {
    if (p.shareWithBlockTime == null || !p.queryCount) continue;
    compared += comparedQueries(p);
    total += p.queryCount;
  }
  return total > 0 ? compared / total : null;
}

/** True when the publisher has gone quiet, false when it is posting, null when nobody knows. */
export function publisherSilent(lastPostAt: number | null, nowSeconds: number): boolean | null {
  if (lastPostAt == null) return null;
  return nowSeconds - lastPostAt > PUBLISHER_SILENT_AFTER_SECONDS;
}

/** "~45s", "~69 min", "~3 h", "~2 d". */
export function formatSpan(seconds: number): string {
  if (seconds < 90) return `~${Math.round(seconds)}s`;
  const min = seconds / 60;
  if (min < 90) return `~${Math.round(min)} min`;
  const hours = min / 60;
  if (hours < 48) return `~${Math.round(hours)} h`;
  return `~${Math.round(hours / 24)} d`;
}

export function formatBehind(seconds: number): string {
  return `${formatSpan(seconds)} behind`;
}
