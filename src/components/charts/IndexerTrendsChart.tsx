'use client';

import { useState } from 'react';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { isUnavailable, unavailableReason, useQueryState } from '@/hooks/useQueryState';
import { useIndexerTrends } from '@/hooks/useNetworkStats';
import { formatGRT, formatGRTFull } from '@/lib/utils';
import { denseDaily, labelWithNoCollections, utcDayLabel, utcDayStart } from '@/lib/day-series';
import type { IndexerTrendsResponse } from '@/lib/contracts/indexer-trends';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

type Tab = 'rewards' | 'fees' | 'cumulative';

export const TREND_DAYS = 90;

interface RewardPoint {
  day: number;
  date: string;
  indexerRewards: number;
  delegatorRewards: number;
  total: number;
}

interface FeePoint {
  day: number;
  date: string;
  collected: number;
  curators: number;
  net: number;
}

interface CumulativePoint {
  day: number;
  date: string;
  cumulative: number;
}

const FEE_LABELS: Record<string, string> = {
  collected: 'Collected (gross)',
  curators: 'Curator Share',
  net: 'Net to Indexer',
};

/** Every UTC day of the window, zero where nothing was paid. */
export function buildTrendSeries(
  data: IndexerTrendsResponse | undefined,
  windowDays: number = TREND_DAYS,
  nowMs: number = Date.now(),
): { rewards: RewardPoint[]; fees: FeePoint[]; cumulative: CumulativePoint[] } {
  const rewards = denseDaily(
    windowDays,
    data?.rewards ?? [],
    (r) => utcDayStart(r.timestamp),
    (day, r): RewardPoint => ({
      day,
      date: utcDayLabel(day),
      indexerRewards: r ? Number(r.totalIndexerRewards) / 1e18 : 0,
      delegatorRewards: r ? Number(r.totalDelegationRewards) / 1e18 : 0,
      total: r ? Number(r.totalRewards) / 1e18 : 0,
    }),
    nowMs,
  );
  const fees = denseDaily(
    windowDays,
    data?.queryFees ?? [],
    (f) => utcDayStart(f.timestamp),
    (day, f): FeePoint => ({
      day,
      date: utcDayLabel(day),
      collected: f ? Number(f.totalCollected) / 1e18 : 0,
      curators: f ? Number(f.totalCurators) / 1e18 : 0,
      net: f ? Number(f.totalCollectedNet) / 1e18 : 0,
    }),
    nowMs,
  );
  let running = 0;
  const cumulative = rewards.map((p) => {
    running += p.total;
    return { day: p.day, date: p.date, cumulative: running };
  });
  return { rewards, fees, cumulative };
}

const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--border-mid)',
    borderRadius: 'var(--radius-button)',
    color: 'var(--text)',
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text)' },
  itemStyle: { color: 'var(--text-muted)' },
};

export function IndexerTrendsChart({ indexer }: { indexer: string }) {
  const [tab, setTab] = useState<Tab>('rewards');
  const state = useQueryState(useIndexerTrends(indexer, TREND_DAYS));
  const data = state.kind === 'ready' ? state.data : undefined;

  const { rewards: rewardData, fees: feeData, cumulative: cumulativeData } = buildTrendSeries(data);

  const hasRewards = (data?.rewards?.length ?? 0) > 0;
  const hasFees = (data?.queryFees?.length ?? 0) > 0;
  const hasData = hasRewards || hasFees;
  const interval = Math.max(0, Math.floor(TREND_DAYS / 6) - 1);

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Daily Trends</CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab('rewards')}
              className={`px-2.5 py-1 text-xs rounded-[var(--radius-button)] transition-colors ${
                tab === 'rewards'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Rewards
            </button>
            <button
              onClick={() => setTab('fees')}
              className={`px-2.5 py-1 text-xs rounded-[var(--radius-button)] transition-colors ${
                tab === 'fees'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Query Fees
            </button>
            <button
              onClick={() => setTab('cumulative')}
              className={`px-2.5 py-1 text-xs rounded-[var(--radius-button)] transition-colors ${
                tab === 'cumulative'
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Cumulative
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {state.kind === 'loading' ? (
          <ChartSkeleton height="280px" />
        ) : isUnavailable(state) ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-sm text-[var(--text-faint)]">{unavailableReason(state)}</p>
          </div>
        ) : !hasData ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-sm text-[var(--text-faint)]">No trend data available yet</p>
          </div>
        ) : tab === 'rewards' ? (
          <div className="h-[280px]">
            {!hasRewards ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-[var(--text-faint)]">No reward data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rewardData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    interval={interval}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    tickFormatter={(v) => formatGRT(v)}
                    width={60}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    labelFormatter={(label, payload) => labelWithNoCollections(label, payload)}
                    formatter={(value, name) => [
                      formatGRTFull(Number(value)) + ' GRT',
                      name === 'indexerRewards' ? 'Indexer' : 'Delegator',
                    ]}
                  />
                  <Legend
                    formatter={(v) => (v === 'indexerRewards' ? 'Indexer' : 'Delegator')}
                    wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }}
                  />
                  <Bar dataKey="indexerRewards" stackId="rewards" fill="var(--accent)" fillOpacity={0.8} />
                  <Bar
                    dataKey="delegatorRewards"
                    stackId="rewards"
                    fill="var(--green)"
                    fillOpacity={0.7}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ) : tab === 'fees' ? (
          <div className="h-[280px]">
            {!hasFees ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-[var(--text-faint)]">No query fee data for this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={feeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    interval={interval}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    tickFormatter={(v) => formatGRT(v)}
                    width={60}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    labelFormatter={(label, payload) => labelWithNoCollections(label, payload)}
                    formatter={(value, name) => [
                      formatGRTFull(Number(value)) + ' GRT',
                      FEE_LABELS[String(name)] ?? String(name),
                    ]}
                  />
                  <Legend
                    formatter={(v) => FEE_LABELS[String(v)] ?? String(v)}
                    wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }}
                  />
                  <Bar dataKey="collected" fill="var(--accent)" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="curators" fill="var(--amber)" fillOpacity={0.6} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="net" fill="var(--green)" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        ) : (
          <div className="h-[280px]">
            {!hasRewards ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-sm text-[var(--text-faint)]">No reward data for cumulative view</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cumulativeData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendCumulativeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    interval={interval}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    tickFormatter={(v) => formatGRT(v)}
                    width={60}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [formatGRTFull(Number(value)) + ' GRT', 'Cumulative Rewards']}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="cumulative"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#trendCumulativeGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
        <p className="text-[10px] text-[var(--text-faint)] mt-2 text-right">
          Arbitrum events via graph-allocations-nest, dated by the collection that paid them. Net is what the
          indexer received, after the 1% protocol tax, the curators&apos; share and the delegators&apos; cut.
          Fees are shown gross, with net beside them, over UTC calendar days.
        </p>
        <p className="text-[10px] text-[var(--text-faint)] mt-1 text-right">
          Until 5 September this chart read a community subgraph through a gateway key Lodestar no longer
          holds. Checked against that subgraph, every indexer-day from 24 July to 22 August matched to the wei.
        </p>
      </CardContent>
    </Card>
  );
}
