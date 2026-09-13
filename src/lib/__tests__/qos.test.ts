import { describe, it, expect } from 'vitest';
import {
  chartSeries,
  foghornDaily,
  foghornWindow,
  publisherSilent,
  qosGrade,
  shareOver5Min,
  windowDays,
  PUBLISHER_SILENT_AFTER_SECONDS,
} from '../qos';
import type { IndexerQosPoint } from '@/lib/contracts/indexer-qos';
import type { FoghornQosBucket } from '@/lib/foghorn';

const point = (date: string, over: Partial<IndexerQosPoint> = {}): IndexerQosPoint => ({
  date,
  queryCount: 100,
  successRate: 99,
  latencyMs: 120,
  blocksBehind: 3,
  avgQueryFee: 0.001,
  totalQueryFees: 0.1,
  buckets: 288,
  partial: false,
  badBuckets: 0,
  worstBucket: null,
  secondsBehind: 12,
  shareQueriesOver5MinBehind: 0,
  shareWithBlockTime: 1,
  gatewayIds: ['0xgw'],
  ...over,
});

const bucket = (start: string, over: Partial<FoghornQosBucket> = {}): FoghornQosBucket => ({
  indexer_wallet: '0xi',
  subgraph_deployment_ipfs_hash: 'Qm1',
  bucket_start: start,
  bucket_secs: 300,
  gateway_id: 'foghorn',
  chain_id: null,
  query_count: 1,
  num_indexer_200_responses: 1,
  proportion_indexer_200_responses: 1,
  avg_indexer_latency_ms: 100,
  max_indexer_latency_ms: 100,
  stdev_indexer_latency_ms: null,
  latency_p50_ms: null,
  latency_p95_ms: null,
  latency_p99_ms: null,
  avg_indexer_blocks_behind: null,
  max_indexer_blocks_behind: null,
  comparable_count: 0,
  divergent_count: 0,
  correctness_rate: null,
  ...over,
});

describe('windowDays', () => {
  it('is every UTC day of the window, oldest first, today last', () => {
    const days = windowDays(3, Date.parse('2026-09-13T18:00:00Z'));
    expect(days).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
  });
});

describe('chartSeries', () => {
  /** The old card drew what the route returned, so a day with no postings simply vanished from the axis. */
  it('keeps a day with no postings on the axis as a gap, never a zero', () => {
    const days = ['2026-09-06', '2026-09-07', '2026-09-08'];
    const series = chartSeries([point('2026-09-06'), point('2026-09-08')], days, new Map());
    expect(series.map((d) => d.date)).toEqual(days);
    expect(series[1]).toMatchObject({ measured: false, queryCount: null, successRate: null, totalQueryFees: null, buckets: null });
    expect(series[0].queryCount).toBe(100);
  });

  it('marks a day with fewer than 288 buckets as partial', () => {
    const series = chartSeries([point('2026-09-07', { buckets: 170, partial: true })], ['2026-09-07'], new Map());
    expect(series[0]).toMatchObject({ partial: true, buckets: 170 });
  });

  it('lays Foghorn beside the oracle without inventing an oracle figure for a probed day', () => {
    const fog = foghornDaily([bucket('2026-09-07T00:00:00Z', { query_count: 4, num_indexer_200_responses: 3 })], false);
    const [day] = chartSeries([], ['2026-09-07'], fog);
    expect(day.successRate).toBeNull();
    expect(day.probeSuccessRate).toBe(75);
  });
});

describe('foghornDaily', () => {
  it('weights success by probes and latency by successful responses, and leaves correctness null with nothing comparable', () => {
    const fog = foghornDaily(
      [
        bucket('2026-09-07T00:00:00Z', { query_count: 10, num_indexer_200_responses: 10, avg_indexer_latency_ms: 100 }),
        bucket('2026-09-07T00:05:00Z', { query_count: 10, num_indexer_200_responses: 0, avg_indexer_latency_ms: 5000 }),
      ],
      false,
    );
    const w = foghornWindow(fog.values());
    expect(w.successRate).toBe(50);
    expect(w.latencyMs).toBe(100);
    expect(w.correctnessRate).toBeNull();
  });

  it('computes correctness from comparable answers, not from probes', () => {
    const fog = foghornDaily([bucket('2026-09-07T00:00:00Z', { query_count: 50, comparable_count: 4, divergent_count: 1 })], false);
    expect(foghornWindow(fog.values()).correctnessRate).toBe(75);
  });

  it('drops the oldest day of a read that hit its row cap, because that day is only partly there', () => {
    const buckets = [bucket('2026-09-08T00:00:00Z'), bucket('2026-09-07T23:55:00Z')];
    expect([...foghornDaily(buckets, true).keys()]).toEqual(['2026-09-08']);
    expect([...foghornDaily(buckets, false).keys()].sort()).toEqual(['2026-09-07', '2026-09-08']);
  });
});

describe('shareOver5Min', () => {
  it('weights each day by its queries', () => {
    const share = shareOver5Min([
      point('a', { queryCount: 900, shareQueriesOver5MinBehind: 0 }),
      point('b', { queryCount: 100, shareQueriesOver5MinBehind: 1 }),
    ]);
    expect(share).toBeCloseTo(0.1, 12);
  });

  it('is null when no day carries the figure', () => {
    expect(shareOver5Min([point('a', { shareQueriesOver5MinBehind: null })])).toBeNull();
  });
});

describe('publisherSilent', () => {
  it('is null when the last post is unknown, and true only past the threshold', () => {
    expect(publisherSilent(null, 1000)).toBeNull();
    expect(publisherSilent(1000, 1000 + PUBLISHER_SILENT_AFTER_SECONDS)).toBe(false);
    expect(publisherSilent(1000, 1001 + PUBLISHER_SILENT_AFTER_SECONDS)).toBe(true);
  });
});

describe('qosGrade', () => {
  it('keeps the retired panel thresholds, 75/60/45/30', () => {
    expect([75, 74.9, 60, 59.9, 45, 44.9, 30, 29.9].map((q) => qosGrade(q).grade)).toEqual(['A', 'B', 'B', 'C', 'C', 'D', 'D', 'F']);
  });
});
