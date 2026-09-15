'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useIndexerQos } from '@/hooks/useNetworkStats';
import { useIndexerQosBuckets, useIndexerQuality } from '@/hooks/useFoghorn';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { formatGRTFull } from '@/lib/utils';
import {
  BUCKETS_PER_DAY,
  FOGHORN_BUCKET_LIMIT,
  FOGHORN_HOURS,
  chartSeries,
  foghornDaily,
  foghornWindow,
  formatBehind,
  formatSpan,
  publisherSilent,
  shareCompared,
  shareOver5Min,
  windowDays,
  type ChartDay,
} from '@/lib/qos';
import type { QosBucketRef } from '@/lib/contracts/indexer-qos';
import type { FoghornQosBuckets } from '@/lib/foghorn';

const WINDOW_DAYS = 90;

type SeriesKey = {
  [K in keyof ChartDay]: ChartDay[K] extends number | null ? K : never;
}[keyof ChartDay];

/** Behind Freshest Peer only means something where the deployment has peers, so say how much it covers. */
function behindDetail(compared: number | null, over5: number | null): string | undefined {
  const parts: string[] = [];
  if (compared != null) parts.push(`measured on ${(compared * 100).toFixed(1)}% of queries`);
  if (over5 != null) parts.push(`${(over5 * 100).toFixed(1)}% more than five minutes behind`);
  return parts.length ? parts.join('; ') : undefined;
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function formatK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(0);
}

function formatMs(n: number): string {
  return n >= 1000 ? (n / 1000).toFixed(2) + 's' : n.toFixed(0) + 'ms';
}

function formatGRTAuto(n: number): string {
  if (n === 0) return '0.00';
  if (n >= 0.01) return n.toFixed(2);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(2);
}

const orDash = (v: number | null | undefined, format: (n: number) => string) => (v == null ? '—' : format(v));

function worstBucketText(w: QosBucketRef | null): string | null {
  if (!w || w.successRate == null) return null;
  const at = new Date(w.start * 1000).toISOString().slice(5, 16).replace('T', ' ');
  return `worst five minutes ${w.successRate.toFixed(1)}% of ${Math.round(w.queries ?? 0).toLocaleString('en-US')} queries, ${at} UTC`;
}

function dispatchCaption(b: FoghornQosBuckets): string {
  const d = b.dispatch;
  const total = d ? d.paid_direct + d.via_gateway : 0;
  if (d && total > 0) {
    const paid = Math.round((d.paid_direct / total) * 100);
    return `${paid}% of those probes were paid direct and carry no selection bias; the other ${100 - paid}% went through Edge & Node's gateway, which avoids indexers it believes unhealthy, so that part of the success rate is an upper bound.`;
  }
  return b.success_rate_bias ?? "How Foghorn dispatched these probes is not reported, so read its success rate as an upper bound.";
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

function partialDot(color: string) {
  return function PartialDot(props: { cx?: number; cy?: number; index?: number; payload?: ChartDay }) {
    if (!props.payload?.partial || props.cx == null || props.cy == null) return <g key={`d-${props.index}`} />;
    return (
      <circle key={`d-${props.index}`} cx={props.cx} cy={props.cy} r={2.5} fill="var(--bg-elevated)" stroke={color} strokeWidth={1.25} />
    );
  };
}

function QoSMiniChart({
  data,
  dataKey,
  probeKey,
  label,
  summary,
  detail,
  color,
  formatter,
  tickFormatter,
  domain,
}: {
  data: ChartDay[];
  dataKey: SeriesKey;
  probeKey?: SeriesKey;
  label: string;
  summary: string;
  detail?: ReactNode;
  color: string;
  formatter: (v: number) => string;
  tickFormatter: (v: number) => string;
  domain?: [number | string, number | string];
}) {
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-[var(--radius-card)] p-4">
      <div className="flex justify-between items-start gap-2 mb-3">
        <span className="text-sm text-[var(--text-muted)]">{label}</span>
        <span className="text-sm font-mono text-[var(--text)]">{summary}</span>
      </div>
      <div className="h-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`qos-grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-faint)', fontSize: 9 }}
              tickFormatter={shortDate}
              interval={Math.max(0, Math.floor(data.length / 3) - 1)}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--text-faint)', fontSize: 9 }}
              tickFormatter={tickFormatter}
              width={44}
              domain={domain}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              labelFormatter={(iso, payload) => {
                const day = payload?.[0]?.payload as ChartDay | undefined;
                const base = shortDate(String(iso));
                return day?.partial ? `${base}, partial: ${day.buckets} of ${BUCKETS_PER_DAY} buckets` : base;
              }}
              formatter={(v, name) => [
                v == null ? 'no data' : formatter(Number(v)),
                name === probeKey ? `${label}, Foghorn probes` : label,
              ]}
            />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#qos-grad-${dataKey})`}
              connectNulls={false}
              dot={partialDot(color)}
              isAnimationActive={false}
            />
            {probeKey && (
              <Line
                type="monotone"
                dataKey={probeKey}
                stroke="var(--text-muted)"
                strokeDasharray="4 3"
                strokeWidth={1.25}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {detail && <p className="text-[11px] text-[var(--text-faint)] mt-2 leading-snug">{detail}</p>}
    </div>
  );
}

export function IndexerQoSChart({ indexer }: { indexer: string }) {
  const query = useIndexerQos(indexer, WINDOW_DAYS);
  const probes = useIndexerQosBuckets(indexer, FOGHORN_HOURS);
  const quality = useIndexerQuality(indexer);
  // Read once per mount: "now" only decides whether the publisher counts as silent and which days are in the window.
  const [nowMs] = useState(() => Date.now());

  const data = query.status === 'success' ? query.data : undefined;
  const bucketRead = probes.status === 'success' ? probes.data : undefined;
  const truncated = !!bucketRead && bucketRead.buckets.length >= FOGHORN_BUCKET_LIMIT;
  const foghorn = bucketRead ? foghornDaily(bucketRead.buckets, truncated) : new Map();
  const probeWindow = foghornWindow(foghorn.values());
  const probed = foghorn.size > 0;

  const series = data ? chartSeries(data.qos, windowDays(WINDOW_DAYS, nowMs), foghorn) : [];
  const partialDays = data ? data.qos.filter((p) => p.partial).length : 0;
  const nowSeconds = nowMs / 1000;
  const lastPost = data?.freshness.publisherLastPostAt ?? null;
  const silent = data ? publisherSilent(lastPost, nowSeconds) : null;
  const silentFor = lastPost == null ? null : formatSpan(nowSeconds - lastPost);

  const s = data?.summary;
  const over5 = data ? shareOver5Min(data.qos) : null;
  const compared = data ? shareCompared(data.qos) : null;
  const worst = worstBucketText(s?.worstBucket ?? null);
  const q = quality.status === 'success' ? quality.data : undefined;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <CardTitle>Query Performance</CardTitle>
          {/* Two oracles report on this network; an unlabelled chart makes the reader guess which. */}
          <Link
            href="/qos"
            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--accent-text)]"
            title="These figures come from Edge & Node's QoS oracle, which counts queries their gateway actually routed, read from its own postings. Foghorn's probes are drawn beside them and measure capability, not demand; see /qos."
          >
            source: Edge &amp; Node QoS oracle
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {query.status === 'pending' ? (
          <ChartSkeleton height="200px" />
        ) : query.status === 'error' ? (
          <div className="h-[200px] flex items-center justify-center">
            <p className="text-sm text-[var(--red-text)]">{query.error?.message ?? 'Query performance could not be loaded'}</p>
          </div>
        ) : !data || data.qos.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-center">
            <p className="text-sm text-[var(--text-faint)]">
              {silent === true
                ? `No QoS data is available for this indexer. The latest indexed publisher post is ${silentFor} old; recent data may be incomplete.`
                : silent === null
                  ? 'No QoS data is available for this indexer. The latest indexed publisher post is unknown.'
                  : `No QoS data is available for this indexer in the last ${WINDOW_DAYS} days.`}
            </p>
          </div>
        ) : (
          <>
            {silent === true && (
              <p className="text-[11px] text-[var(--amber)] mb-3">
                The latest indexed publisher post is {silentFor} old. This indexer&apos;s newest figures are from{' '}
                {data.freshness.newestDate ?? 'an unknown day'}.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <QoSMiniChart
                data={series}
                dataKey="queryCount"
                label="Query Count"
                summary={orDash(s?.queryCount, formatK)}
                color="var(--accent)"
                formatter={(v) => formatK(v) + ' queries'}
                tickFormatter={formatK}
              />
              <QoSMiniChart
                data={series}
                dataKey="totalQueryFees"
                label="Query Fees"
                summary={orDash(s?.totalQueryFees, (v) => formatGRTFull(v) + ' GRT')}
                color="var(--green)"
                formatter={(v) => formatGRTFull(v) + ' GRT'}
                tickFormatter={(v) => formatGRTFull(v)}
              />
              <QoSMiniChart
                data={series}
                dataKey="avgQueryFee"
                label="Avg. Query Fee"
                summary={orDash(s?.avgQueryFee, (v) => formatGRTAuto(v) + ' GRT')}
                detail={`over ${WINDOW_DAYS} days; latest day (${s?.latestDate ?? '—'}) ${orDash(s?.latestAvgQueryFee, (v) => formatGRTAuto(v) + ' GRT')}`}
                color="var(--amber)"
                formatter={(v) => formatGRTAuto(v) + ' GRT'}
                tickFormatter={(v) => formatGRTAuto(v)}
              />
              <QoSMiniChart
                data={series}
                dataKey="successRate"
                probeKey="probeSuccessRate"
                label="Query Success Rate"
                summary={orDash(s?.successRate, (v) => v.toFixed(2) + '%')}
                detail={
                  <>
                    {s && s.badBuckets > 0
                      ? `${s.badBuckets.toLocaleString('en-US')} five-minute buckets under 90%`
                      : 'no five-minute bucket under 90%'}
                    {worst && (
                      <>
                        <br />
                        {worst}
                      </>
                    )}
                  </>
                }
                color="var(--green)"
                formatter={(v) => v.toFixed(2) + '%'}
                tickFormatter={(v) => v.toFixed(0) + '%'}
                domain={[0, 100]}
              />
              <QoSMiniChart
                data={series}
                dataKey="latencyMs"
                probeKey="probeLatencyMs"
                label="Avg. Indexer Latency"
                summary={orDash(s?.latencyMs, formatMs)}
                detail={
                  q && q.p50_latency_ms != null && q.p95_latency_ms != null
                    ? `Foghorn probes over ${q.days} days: p50 ${formatMs(q.p50_latency_ms)}, p95 ${formatMs(q.p95_latency_ms)}`
                    : undefined
                }
                color="var(--accent)"
                formatter={formatMs}
                tickFormatter={formatMs}
              />
              <QoSMiniChart
                data={series}
                dataKey="secondsBehind"
                label="Behind Freshest Peer"
                summary={orDash(s?.secondsBehind, formatBehind)}
                detail={behindDetail(compared, over5)}
                color="var(--amber)"
                formatter={formatBehind}
                tickFormatter={(v) => formatSpan(v).replace('~', '')}
              />
              {probed && (
                <QoSMiniChart
                  data={series}
                  dataKey="probeCorrectnessRate"
                  label="Correctness, Foghorn probes"
                  summary={orDash(probeWindow.correctnessRate, (v) => v.toFixed(2) + '%')}
                  detail={`${probeWindow.comparable.toLocaleString('en-US')} answers comparable against a majority`}
                  color="var(--text-muted)"
                  formatter={(v) => v.toFixed(2) + '%'}
                  tickFormatter={(v) => v.toFixed(0) + '%'}
                  domain={[0, 100]}
                />
              )}
            </div>
            <div className="mt-3 space-y-1 text-[10px] text-[var(--text-faint)] leading-relaxed">
              {probes.status === 'error' ? (
                <p>Foghorn&apos;s probes could not be loaded: {probes.error?.message}</p>
              ) : bucketRead && !probed ? (
                <p>Foghorn has not probed this indexer in the last 30 days.</p>
              ) : bucketRead ? (
                <>
                  <p>
                    Dashed lines are Foghorn&apos;s probes over the last 30 days: queries Lodestar dispatched to
                    measure this indexer, never demand. Query count and fees are Edge &amp; Node&apos;s routed
                    traffic only.
                  </p>
                  <p>{dispatchCaption(bucketRead)}</p>
                  {truncated && (
                    <p>
                      Foghorn&apos;s series starts later than 30 days ago because the read reached its{' '}
                      {FOGHORN_BUCKET_LIMIT.toLocaleString('en-US')}-bucket cap.
                    </p>
                  )}
                </>
              ) : null}
              <p>
                {partialDays > 0
                  ? `${partialDays} partial ${partialDays === 1 ? 'day' : 'days'} (fewer than ${BUCKETS_PER_DAY} five-minute buckets) drawn hollow; `
                  : ''}
                days with no postings are gaps, not zeros.
              </p>
            </div>
            <p className="text-[10px] text-[var(--text-faint)] mt-3 text-right">
              Source: Edge &amp; Node QoS oracle postings, via the QoS nest · {WINDOW_DAYS} day window
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
