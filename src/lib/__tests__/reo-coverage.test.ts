import { describe, expect, it } from 'vitest';
import type { QosDeploymentRow } from '@/lib/contracts/indexer-qos';
import { REO_SIGNAL_FLOOR_GRT, coverage, coverageChanged, subgraphsRequired } from '../reo-coverage';

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
