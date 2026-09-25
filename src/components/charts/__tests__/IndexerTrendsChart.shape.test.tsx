// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { IndexerTrendsResponse } from '@/lib/contracts/indexer-trends';

const { seen } = vi.hoisted(() => ({ seen: [] as Array<{ kind: string; props: Record<string, unknown> }> }));

vi.mock('recharts', async () => {
  const React = await import('react');
  const make = (kind: string) =>
    function Stub(props: Record<string, unknown> & { children?: React.ReactNode }) {
      seen.push({ kind, props });
      return React.createElement('div', { 'data-kind': kind }, props.children);
    };
  return {
    ResponsiveContainer: make('ResponsiveContainer'),
    AreaChart: make('AreaChart'),
    Area: make('Area'),
    BarChart: make('BarChart'),
    Bar: make('Bar'),
    XAxis: make('XAxis'),
    YAxis: make('YAxis'),
    CartesianGrid: make('CartesianGrid'),
    Tooltip: make('Tooltip'),
    Legend: make('Legend'),
  };
});

let mockQuery: { status: string; fetchStatus: string; data?: IndexerTrendsResponse };
vi.mock('@/hooks/useNetworkStats', () => ({ useIndexerTrends: () => mockQuery }));

import { IndexerTrendsChart, TREND_DAYS, buildTrendSeries } from '../IndexerTrendsChart';

const micros = (y: number, m: number, d: number) => String(Date.UTC(y, m - 1, d) * 1000);

/** Two lump payments 18 days apart, as p2p-org-arbitrum.eth was paid in August. */
const SPARSE: IndexerTrendsResponse = {
  rewards: [
    { timestamp: micros(2026, 9, 10), indexer: '0x1', totalRewards: '3000000000000000000', totalIndexerRewards: '1000000000000000000', totalDelegationRewards: '2000000000000000000', rewardCount: '1' },
    { timestamp: micros(2026, 8, 23), indexer: '0x1', totalRewards: '6000000000000000000', totalIndexerRewards: '2000000000000000000', totalDelegationRewards: '4000000000000000000', rewardCount: '2' },
  ],
  queryFees: [
    { timestamp: micros(2026, 8, 23), indexer: '0x1', totalCollected: '1000000000000000000', totalCurators: '100000000000000000', totalProtocolTax: '10000000000000000', totalCollectedNet: '800000000000000000', feeCount: '1' },
  ],
};

describe('IndexerTrendsChart draws only what happened', () => {
  beforeEach(() => {
    seen.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
    mockQuery = { status: 'success', fetchStatus: 'idle', data: SPARSE };
  });
  afterEach(() => vi.useRealTimers());

  it('builds a point for every UTC day of the window, zero where nothing was paid', () => {
    const { rewards, fees, cumulative } = buildTrendSeries(SPARSE, TREND_DAYS, Date.UTC(2026, 8, 14, 12));
    expect(rewards).toHaveLength(TREND_DAYS);
    expect(fees).toHaveLength(TREND_DAYS);
    expect(rewards.filter((p) => p.total > 0).map((p) => p.total)).toEqual([6, 3]);
    expect(fees.filter((p) => p.collected > 0)).toHaveLength(1);
    expect(cumulative.at(-1)?.cumulative).toBe(9);
    expect(new Set(cumulative.map((p) => p.cumulative))).toEqual(new Set([0, 6, 9]));
  });

  it('draws daily rewards as stacked bars over every day, never an interpolated area', () => {
    render(<IndexerTrendsChart indexer="0x1" />);
    const chart = seen.find((s) => s.kind === 'BarChart');
    expect((chart?.props.data as unknown[]).length).toBe(TREND_DAYS);
    const bars = seen.filter((s) => s.kind === 'Bar');
    expect(bars.map((b) => b.props.dataKey)).toEqual(['indexerRewards', 'delegatorRewards']);
    expect(new Set(bars.map((b) => b.props.stackId))).toEqual(new Set(['rewards']));
    expect(seen.some((s) => s.kind === 'Area')).toBe(false);
  });

  it('steps the cumulative total over every day instead of smoothing between payments', () => {
    render(<IndexerTrendsChart indexer="0x1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Cumulative' }));
    const areas = seen.filter((s) => s.kind === 'Area');
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.every((a) => a.props.type === 'stepAfter')).toBe(true);
    const chart = seen.filter((s) => s.kind === 'AreaChart').at(-1);
    expect((chart?.props.data as unknown[]).length).toBe(TREND_DAYS);
  });
});
