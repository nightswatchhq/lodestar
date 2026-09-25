// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { seen } = vi.hoisted(() => ({ seen: [] as Array<{ kind: string; props: Record<string, unknown> }> }));

vi.mock('recharts', async () => {
  const R = await import('react');
  const make = (kind: string) =>
    function Stub(props: Record<string, unknown> & { children?: React.ReactNode }) {
      seen.push({ kind, props });
      return R.createElement('div', { 'data-kind': kind }, props.children);
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

/** p2p-org-arbitrum.eth's 30 days to 14 September: paid on two days, nothing on the other 28. */
vi.mock('@/lib/api', () => ({
  fetchIndexerRevenue: vi.fn(async () => ({
    indexer: '0x1',
    windowDays: 30,
    rav_grt: 15760.41,
    indexing_rewards_grt: 1172883.9,
    total_grt: 1188644.31,
    query_fees_gross_grt: 17000,
    indexing_rewards_gross_grt: 2300000,
    daily: [
      { date: '2026-08-23', rav_grt: 12534.39, indexing_rewards_grt: 1172883.9, total_grt: 1185418.29, query_fees_gross_grt: 14000, indexing_rewards_gross_grt: 2300000 },
      { date: '2026-08-24', rav_grt: 3226.02, indexing_rewards_grt: 0, total_grt: 3226.02, query_fees_gross_grt: 3000, indexing_rewards_gross_grt: 0 },
    ],
  })),
  fetchIndexerPnl: vi.fn(async () => ({
    pnl: {
      revenue_grt: 1188644.31, revenue_usd: null, infra_cost_usd: 300, infra_monthly_usd: 300, net_usd: null,
      margin_pct: null, breakeven_grt_price: null, perDeployment: [],
    },
    costModel: { lines: [], baseOverheadUsd: 0, totalMonthlyUsd: 300 },
    defaultChainCosts: {},
  })),
}));

import { PnlPanel } from '../PnlPanel';

describe('PnlPanel draws only what was paid', () => {
  beforeEach(() => {
    seen.length = 0;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-14T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('charts every UTC day of the window as stacked bars, not a slope between two payments', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PnlPanel indexer="0x1" grtPrice={0} />
      </QueryClientProvider>,
    );
    await screen.findByText('Revenue Received');
    const chart = seen.filter((s) => s.kind === 'BarChart').at(-1);
    const data = chart?.props.data as Array<{ date: string; rav: number; rewards: number }>;
    expect(data).toHaveLength(30);
    expect(data.filter((d) => d.rav + d.rewards > 0).map((d) => d.date)).toEqual([
      expect.stringMatching(/^23 Aug/),
      expect.stringMatching(/^24 Aug/),
    ]);
    const bars = seen.filter((s) => s.kind === 'Bar');
    expect(new Set(bars.map((b) => b.props.dataKey))).toEqual(new Set(['rewards', 'rav']));
    expect(new Set(bars.map((b) => b.props.stackId))).toEqual(new Set(['revenue']));
    expect(seen.some((s) => s.kind === 'Area' || s.kind === 'AreaChart')).toBe(false);
  });
});
