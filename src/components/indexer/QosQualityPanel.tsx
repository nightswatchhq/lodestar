'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useIndexerQosDeployments, useIndexerQosScore } from '@/hooks/useNetworkStats';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { formatBehind, qosGrade } from '@/lib/qos';
import type { QosDeploymentRow } from '@/lib/contracts/indexer-qos';

/**
 * Which factor of `R · U_lat · U_fresh^0.5` costs a deployment its score, so a deployment at 100%
 * success never reads as an error because it lags.
 */
function dominantDeficit(d: QosDeploymentRow): { label: string; color: string; loss: number } | null {
  const candidates = [
    { key: 'reliability', loss: 1 - (d.reliability_used ?? 1), color: 'var(--red)' },
    { key: 'latency', loss: 1 - d.lat_util, color: 'var(--accent)' },
    { key: 'freshness', loss: d.fresh_util === null ? 0 : 1 - Math.sqrt(d.fresh_util), color: 'var(--amber)' },
  ];
  const worst = candidates.reduce((a, b) => (b.loss > a.loss ? b : a));
  if (worst.loss < 0.02) return null;

  if (worst.key === 'freshness') {
    return {
      label: d.time_behind_own_sec != null ? formatBehind(d.time_behind_own_sec) : 'behind chain head',
      color: worst.color,
      loss: worst.loss,
    };
  }
  if (worst.key === 'latency') return { label: 'slow vs peers', color: worst.color, loss: worst.loss };
  return { label: 'serving errors', color: worst.color, loss: worst.loss };
}

/** Which deployments hold the score down, heaviest first. A grade alone says nothing about where. */
function DeploymentDrag({ indexer }: { indexer: string }) {
  const query = useIndexerQosDeployments(indexer);
  const rows = (query.status === 'success' ? query.data.deployments : [])
    .filter((d) => d.measured && d.drag > 0.005)
    .slice(0, 5);
  if (rows.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-xs font-medium text-[var(--text)]">What is holding the score down</p>
        <p className="text-[10px] text-[var(--text-faint)]">bar = share of the score lost here</p>
      </div>
      <div className="space-y-1.5">
        {rows.map((d) => {
          const cohortBroken = d.cohort_best_reliability != null && d.cohort_best_reliability < 0.9;
          const deficit = dominantDeficit(d);
          return (
            <div key={d.deployment_id} data-testid="qos-drag-row" className="flex items-center gap-2 text-[11px]">
              <code className="text-[var(--text-muted)] truncate max-w-[8rem]" title={d.deployment_id}>
                {d.deployment_id.slice(0, 10)}…
              </code>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, d.drag * 100)}%`,
                    backgroundColor: deficit?.color ?? 'var(--text-faint)',
                  }}
                />
              </div>
              <span className="font-mono text-[var(--text-muted)] tabular-nums shrink-0">
                {(d.weight * 100).toFixed(0)}% of traffic
              </span>
              <span
                className="font-mono text-[var(--text-faint)] tabular-nums w-10 text-right shrink-0"
                title="Success rate over the window"
              >
                {d.reliability != null ? `${(d.reliability * 100).toFixed(0)}%` : '—'}
              </span>
              <span
                className="tabular-nums w-[6.5rem] text-right shrink-0"
                style={{ color: deficit?.color ?? 'var(--text-faint)' }}
                title={deficit ? 'The largest single factor costing this deployment score' : undefined}
              >
                {deficit?.label ?? 'healthy'}
              </span>
              {cohortBroken && (
                <span
                  className="text-[10px] text-[var(--text-faint)] shrink-0"
                  title="Every indexer measured on this deployment is struggling, so it is graded against what the cohort achieves rather than against perfection."
                >
                  cohort
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[var(--text-faint)] mt-1.5 leading-relaxed">
        Share of served queries, success rate, then the biggest single reason that deployment is costing
        score: a subgraph can be answered perfectly and still drag the grade by lagging chain head. A
        deployment marked &ldquo;cohort&rdquo; is failing for every indexer serving it, which is usually
        the subgraph rather than the operator.
      </p>
    </div>
  );
}

function Bar({ label, value, hint }: { label: string; value: number | null; hint?: string }) {
  const pct = Math.round((value ?? 0) * 100);
  const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
  return (
    <div title={hint}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-mono text-[var(--text)]">{value == null ? '—' : `${pct}`}</span>
      </div>
      <div className="w-full h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function QosQualityPanel({ indexer }: { indexer: string }) {
  const query = useIndexerQosScore(indexer);
  const score = query.status === 'success' ? query.data : undefined;

  const latest = score?.latest ?? null;
  const series = (score?.daily ?? [])
    .filter((d) => d.q_score != null)
    .map((d) => ({
      date: d.day ? new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : '',
      q: d.q_score as number,
    }));

  const q = latest?.q_score ?? null;
  const grade = q != null ? qosGrade(q) : null;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>QoS Quality</CardTitle>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              Selection-bias-aware service quality, not raw query volume
            </p>
          </div>
          {grade && q != null && (
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-2xl font-mono font-bold',
                  q >= 75 ? 'text-[var(--green)]' : q >= 45 ? 'text-[var(--amber)]' : 'text-[var(--red-text)]',
                )}
              >
                {q.toFixed(0)}
              </span>
              <Badge variant={grade.variant}>{grade.grade}</Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {query.status === 'pending' ? (
          <ChartSkeleton height="180px" />
        ) : query.status === 'error' ? (
          <div className="h-[120px] flex items-center justify-center">
            <p className="text-sm text-[var(--red-text)]">{query.error?.message ?? 'The QoS score could not be loaded'}</p>
          </div>
        ) : !latest || q == null ? (
          <div className="h-[120px] flex items-center justify-center text-center">
            <p className="text-sm text-[var(--text-faint)]">
              No QoS quality score; the oracle records data only for queries the gateway routed to this
              indexer.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-4">
              <Bar label="Reliability (Wilson)" value={latest.reliability} hint="Wilson lower-bound success rate, so small samples can't fake a high score" />
              <Bar label="Latency" value={latest.lat_util} hint="Exponential-decay utility, normalised to the per-deployment peer cohort" />
              <Bar label="Freshness" value={latest.fresh_util} hint="Closeness to chain head (seconds behind)" />
              <Bar label="Coverage" value={latest.coverage} hint="Breadth of deployments served with credible volume" />
            </div>

            {latest.served_gap != null && (() => {
              const gap = latest.served_gap;
              const flagged = gap > 0.3;
              return (
                <div
                  className={cn(
                    'flex items-start gap-2.5 p-2.5 mb-4 rounded-lg border',
                    flagged ? 'bg-[var(--red-dim)] border-[var(--red)]' : 'bg-[var(--bg-elevated)] border-[var(--border)]',
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-mono font-semibold mt-0.5',
                      flagged ? 'text-[var(--red-text)]' : gap < 0 ? 'text-[var(--green)]' : 'text-[var(--text-muted)]',
                    )}
                  >
                    {gap >= 0 ? '+' : ''}{(gap * 100).toFixed(0)}%
                  </span>
                  <div>
                    <p className="text-xs font-medium text-[var(--text)]" title="Allocation share minus routing share, averaged over allocated deployments. Routing share is this indexer's attempts over every indexer's attempts on the deployment.">
                      Served-vs-allocated gap
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {flagged
                        ? 'Allocation share well above routing share: it holds allocation while the gateway routes queries elsewhere, capturing rewards without serving proportional traffic.'
                        : gap < 0
                          ? 'Routing share above allocation share: it is sent more of the attempts than its allocation would suggest.'
                          : 'Routing share roughly tracks allocation share.'}
                    </p>
                    <p className="text-[10px] text-[var(--text-faint)] mt-0.5">allocation share minus routing share</p>
                  </div>
                </div>
              );
            })()}

            <DeploymentDrag indexer={indexer} />

            {series.length > 1 ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="qosGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: 'var(--text-faint)', fontSize: 10 }} width={28} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-button)', color: 'var(--text)', fontSize: 12 }}
                      formatter={(v) => [Number(v).toFixed(1), 'Q-score']}
                    />
                    <Area type="monotone" dataKey="q" stroke="var(--accent)" strokeWidth={2} fill="url(#qosGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-[10px] text-[var(--text-faint)]">
                Fewer than two days in the window have a score, so there is no history to draw.
              </p>
            )}

            <p className="text-[10px] text-[var(--text-faint)] mt-3 leading-relaxed">
              Wilson reliability × latency decay × freshness (weighted product), EWMA-decayed over{' '}
              {score?.window_days ?? 30} days, normalised per deployment and weighted by queries served.
              Recomputed for every day in the window from Edge &amp; Node&apos;s oracle postings. Latency uses
              averages; Foghorn&apos;s probe percentiles are on Query Performance. A low score can also mean the
              gateway routes around this indexer.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
