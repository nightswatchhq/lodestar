import { describe, expect, it } from 'vitest';
import type { QosDeploymentRow, QualifyingDaysResponse } from '@/lib/contracts/indexer-qos';
import { REO_SIGNAL_FLOOR_GRT, coverage, coverageChanged, dailyStrip, subgraphsRequired } from '../reo-coverage';

const row = (deployment_id: string, queries: number): QosDeploymentRow => ({
  deployment_id,
  queries,
  weight: 0,
  reliability: null,
  reliability_used: null,
  cohort_best_reliability: null,
  lat_util: 1,
  fresh_util: null,
  time_behind_sec: null,
  time_behind_own_sec: null,
  served_share: null,
  q: null,
  measured: true,
  drag: 0,
});

describe('the coverage test', () => {
  it('needs one subgraph until 6 October and five from it', () => {
    expect(subgraphsRequired(Date.UTC(2026, 9, 5, 23, 59))).toBe(1);
    expect(subgraphsRequired(Date.UTC(2026, 9, 6))).toBe(5);
    expect(coverageChanged(Date.UTC(2026, 9, 6))).toBe(true);
  });

  it('counts served deployments, those over the floor, and those it cannot place', () => {
    const signal = new Map([
      ['qma', REO_SIGNAL_FLOOR_GRT],
      ['qmb', REO_SIGNAL_FLOOR_GRT - 1],
      ['qmc', 10_000],
    ]);
    const c = coverage([row('QmA', 5), row('QmB', 5), row('QmC', 0), row('QmD', 1)], signal);
    expect(c).toEqual({ served: 3, qualifying: 1, unknown: 1 });
  });

  it('is empty with nothing served', () => {
    expect(coverage([], new Map())).toEqual({ served: 0, qualifying: 0, unknown: 0 });
  });
});

describe('the 28-day strip', () => {
  const day = (date: string, count: number, partial = false) => ({ date, partial, count, count_without_floor: count, deployments: [] });
  const answer = (days: ReturnType<typeof day>[]): QualifyingDaysResponse => ({
    window_days: 28,
    qualifying_test_applied: false,
    bound: 'upper',
    qualifying_test_reason: 'r',
    signal_floor_grt: 500,
    signal_floor_applied: true,
    signal_floor_reason: null,
    days,
  });

  it('draws every day of the window, oldest first, and leaves a day kittiwake did not send blank', () => {
    const strip = dailyStrip(answer([day('2026-09-08', 7), day('2026-10-05', 2, true)]), Date.UTC(2026, 9, 5, 12));
    expect(strip).toHaveLength(28);
    expect(strip[0]).toEqual({ date: '2026-09-08', count: 7, partial: false, short: false });
    expect(strip[1]).toEqual({ date: '2026-09-09', count: null, partial: false, short: null });
    expect(strip[27]).toEqual({ date: '2026-10-05', count: 2, partial: true, short: true });
  });

  it('marks a day short below five, and a day at five not', () => {
    const strip = dailyStrip(answer([day('2026-10-04', 5), day('2026-10-05', 4)]), Date.UTC(2026, 9, 5));
    expect(strip.slice(-2).map((c) => c.short)).toEqual([false, true]);
  });
});
