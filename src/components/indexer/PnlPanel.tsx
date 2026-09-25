'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatGRT, formatGRTFull, formatUSD, cn } from '@/lib/utils';
import { fetchIndexerRevenue, fetchIndexerPnl } from '@/lib/api';
import { toCsv } from '@/lib/csv';
import { ExportButton } from '@/components/ui/ExportButton';
import { denseDaily, labelWithNoCollections, utcDayLabel, utcDayStart } from '@/lib/day-series';

const WINDOWS = [7, 30, 90, 365] as const;

// Set to the day the corrected panel reaches production.
export const PNL_CORRECTED_ON = '14 September 2026';
type Window = (typeof WINDOWS)[number];

// Default archive-node selection when the panel first loads.
const DEFAULT_CHAINS = ['arbitrum', 'mainnet'];

interface RevenueDay {
  date: string;
  rav_grt: number;
  indexing_rewards_grt: number;
  total_grt: number;
}
interface RevenueResponse {
  data: {
    rav_grt: number;
    indexing_rewards_grt: number;
    total_grt: number;
    daily: RevenueDay[];
  };
}
interface ChainCost {
  key: string;
  label: string;
  storageTb: number | null;
  monthlyUsd: number;
}
interface DeploymentPnl {
  deployment_id: string | null;
  revenue_grt: number;
  revenue_usd: number | null;
}
interface PnlResponse {
  data: {
    pnl: {
      revenue_grt: number;
      revenue_usd: number | null;
      infra_cost_usd: number;
      infra_monthly_usd: number;
      net_usd: number | null;
      margin_pct: number | null;
      breakeven_grt_price: number | null;
      perDeployment: DeploymentPnl[];
    };
    costModel: { totalMonthlyUsd: number };
    defaultChainCosts: Record<string, ChainCost>;
  };
}

export function PnlPanel({ indexer, grtPrice }: { indexer: string; grtPrice: number }) {
  const [window, setWindow] = useState<Window>(30);
  const [chains, setChains] = useState<string[]>(DEFAULT_CHAINS);

  const addr = indexer.toLowerCase();

  const revenue = useQuery({
    queryKey: ['indexerRevenue', addr, window],
    queryFn: () => fetchIndexerRevenue(addr, window),
    staleTime: 5 * 60 * 1000,
  });

  const pnl = useQuery({
    queryKey: ['indexerPnl', addr, window, chains.join(','), grtPrice],
    queryFn: () =>
      fetchIndexerPnl(addr, {
        windowDays: window,
        grtPrice: grtPrice > 0 ? grtPrice : undefined,
        chain: chains.length ? chains.join(',') : undefined,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const daily = revenue.data?.daily ?? [];
  const p = pnl.data?.pnl;
  const defaultChains = pnl.data?.defaultChainCosts ?? {};

  const chartData = useMemo(
    () =>
      denseDaily(
        window,
        daily,
        (d) => utcDayStart(d.date),
        (day, d) => ({ date: utcDayLabel(day), rav: d?.rav_grt ?? 0, rewards: d?.indexing_rewards_grt ?? 0 }),
      ),
    [daily, window],
  );

  const toggleChain = (key: string) =>
    setChains((c) => (c.includes(key) ? c.filter((k) => k !== key) : [...c, key]));

  const exportCsv = () => {
    const header = [
      'Date',
      'Query Fees Received (GRT)',
      'Indexing Rewards Received (GRT)',
      'Total Received (GRT)',
      'Query Fees Collected (GRT)',
      'Indexing Rewards Collected (GRT)',
    ];
    const rows = daily.map((d) => [
      d.date,
      d.rav_grt.toFixed(2),
      d.indexing_rewards_grt.toFixed(2),
      d.total_grt.toFixed(2),
      d.query_fees_gross_grt.toFixed(2),
      d.indexing_rewards_gross_grt.toFixed(2),
    ]);
    return toCsv(header, rows);
  };

  const isLoading = revenue.isLoading || pnl.isLoading;
  const hasData = daily.length > 0;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>Indexer P&amp;L</CardTitle>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              What the indexer received in query fees and indexing rewards, net of modeled infra cost
            </p>
          </div>
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setWindow(w)}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-[var(--radius-button)] transition-colors',
                  window === w
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
              >
                {w}d
              </button>
            ))}
            <span className="ml-1">
              <ExportButton
                compact
                onExport={exportCsv}
                filename={`pnl-${addr}-${window}d`}
                label="CSV"
                disabled={!hasData}
                title="Export daily P&L as CSV"
              />
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          role="note"
          className="mb-4 rounded-md border border-[var(--amber)] bg-[var(--amber-dim)] p-2.5 text-xs text-[var(--text-muted)]"
        >
          <span className="font-medium text-[var(--text)]">Corrected on {PNL_CORRECTED_ON}.</span>{' '}
          Until then this panel dated indexing rewards by the day an allocation was closed, which missed
          rewards collected on open allocations. It also counted the delegators&apos; share as the
          indexer&apos;s revenue and showed query fees gross. Over the 30 days to 13 September, 54 of the 58
          paid indexers were shown more than 1 GRT off. It now shows the amount each collection paid the
          indexer, on the day it was paid.{' '}
          <a
            href="https://learn-thegraph.com/dispatches/the-pnl-was-wrong/"
            className="text-[var(--accent-text)] hover:underline"
          >
            What was wrong
          </a>
        </div>
        {isLoading ? (
          <ChartSkeleton height="280px" />
        ) : !hasData ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-sm text-[var(--text-faint)]">No revenue recorded in this window yet</p>
          </div>
        ) : (
          <>
            {/* Financial summary */}
            {p && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
                <Stat label="Revenue Received" value={`${formatGRT(p.revenue_grt)} GRT`} sub={p.revenue_usd != null ? formatUSD(p.revenue_usd) : undefined} />
                <Stat label={`Infra Cost (${window}d)`} value={formatUSD(p.infra_cost_usd)} sub={`${formatUSD(p.infra_monthly_usd)}/mo`} />
                <Stat
                  label="Net"
                  value={p.net_usd != null ? formatUSD(p.net_usd) : '—'}
                  valueClass={p.net_usd != null ? (p.net_usd >= 0 ? 'text-[var(--green)]' : 'text-[var(--red-text)]') : undefined}
                  sub={p.margin_pct != null ? `${p.margin_pct.toFixed(1)}% margin` : 'set GRT price'}
                />
              </div>
            )}

            {/* Daily stacked revenue */}
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
                    tickFormatter={(v) => formatGRT(v)}
                    width={60}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-mid)',
                      borderRadius: 'var(--radius-button)',
                      color: 'var(--text)',
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'var(--text)' }}
                    itemStyle={{ color: 'var(--text-muted)' }}
                    labelFormatter={(label, payload) => labelWithNoCollections(label, payload)}
                    formatter={(value, name) => [
                      formatGRTFull(Number(value)) + ' GRT',
                      name === 'rav' ? 'Query Fees Received' : 'Indexing Rewards Received',
                    ]}
                  />
                  <Legend
                    formatter={(v) => (v === 'rav' ? 'Query Fees Received' : 'Indexing Rewards Received')}
                    wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }}
                  />
                  <Bar dataKey="rewards" stackId="revenue" fill="var(--green)" fillOpacity={0.7} />
                  <Bar dataKey="rav" stackId="revenue" fill="var(--accent)" fillOpacity={0.8} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Break-even */}
            {p?.breakeven_grt_price != null && (
              <p className="text-[11px] text-[var(--text-muted)] mt-2">
                Break-even GRT price for this window:{' '}
                <span className="font-mono text-[var(--text)]">${p.breakeven_grt_price.toFixed(4)}</span>
                {grtPrice > 0 && (
                  <span className="text-[var(--text-faint)]">
                    {' '}· {grtPrice >= p.breakeven_grt_price ? 'profitable at current price' : 'underwater at current price'}
                  </span>
                )}
              </p>
            )}

            {/* Archive-node cost selector */}
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-[11px] text-[var(--text-muted)] mb-2">
                Archive nodes run (toggle to model infra cost; these are editable estimates, not gospel):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.values(defaultChains).map((c) => (
                  <button
                    key={c.key}
                    onClick={() => toggleChain(c.key)}
                    className={cn(
                      'px-2 py-1 text-[11px] rounded-[var(--radius-button)] border transition-colors',
                      chains.includes(c.key)
                        ? 'border-[var(--accent)] bg-[var(--accent-dim)] text-[var(--text)]'
                        : 'border-[var(--border)] text-[var(--text-faint)] hover:text-[var(--text-muted)]',
                    )}
                    title={`~${formatUSD(c.monthlyUsd)}/mo`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-deployment breakdown */}
            {p && p.perDeployment.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] text-[var(--text-muted)] mb-2">Top deployments by revenue</p>
                <div className="space-y-1">
                  {p.perDeployment.slice(0, 8).map((d) => (
                    <div
                      key={d.deployment_id ?? 'unattributed'}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-[var(--bg-elevated)]"
                    >
                      <span className="font-mono text-[var(--text-muted)] truncate max-w-[55%]">
                        {d.deployment_id ? `${d.deployment_id.slice(0, 10)}…${d.deployment_id.slice(-6)}` : 'Unattributed'}
                      </span>
                      <span className="font-mono text-[var(--text)]">
                        {formatGRT(d.revenue_grt)} GRT
                        {d.revenue_usd != null && (
                          <span className="text-[var(--text-faint)] ml-1.5">{formatUSD(d.revenue_usd)}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[10px] text-[var(--text-faint)] mt-4 leading-relaxed">
              Revenue is what the indexer received, dated by the collection that paid it: query fees after the 1%
              protocol tax, the curators&apos; share and the delegators&apos; cut, and indexing rewards after the
              delegators&apos; share. The CSV carries the collected figures beside it.
              Infra cost is a modeled estimate from archive-node selection; override per operator.
              Informational only, not financial advice.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-[var(--bg-elevated)] px-3 py-2.5">
      <p className="text-[10px] text-[var(--text-faint)] mb-0.5">{label}</p>
      <p className={cn('text-base font-semibold font-mono', valueClass ?? 'text-[var(--text)]')}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{sub}</p>}
    </div>
  );
}
