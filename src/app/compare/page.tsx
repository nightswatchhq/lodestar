'use client';

import { useState, useMemo, useCallback, Suspense } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { unavailableReason, useQueryState } from '@/hooks/useQueryState';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { useRouter, useSearchParams } from 'next/navigation';
import { useIndexers, useEnrichedIndexers, useNetworkStats } from '@/hooks/useNetworkStats';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import {
  weiToGRT,
  formatGRT,
  formatPPM,
  shortenAddress,
  resolveIndexerName,
  formatRelativeTime,
  cn,
} from '@/lib/utils';
import { calculateDelegationCapacity } from '@/lib/rewards';
import type { Indexer } from '@/lib/queries';
import { fetchIndexerDetail, fetchIndexerTrends, fetchManifestAnalysis } from '@/lib/api';
import { allocationComparison } from '@/lib/allocation-comparison';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

async function deploymentNetworks(hashes: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (let offset = 0; offset < hashes.length; offset += 5) {
    const batch = hashes.slice(offset, offset + 5);
    const manifests = await Promise.allSettled(batch.map(fetchManifestAnalysis));
    manifests.forEach((manifest, idx) => {
      result.set(batch[idx], manifest.status === 'fulfilled' && manifest.value.network !== 'unknown'
        ? manifest.value.network : null);
    });
  }
  return result;
}

// ---------- types ----------

interface ProcessedIndexer {
  id: string;
  name: string;
  selfStake: number;
  delegated: number;
  delegationCapacity: number;
  rewardCut: number;
  effectiveCut: number;
  queryFeeCut: number;
  estimatedAPR: number | null;
  totalRewards: number;
  allocations: number;
  createdAt: number;
  raw: Indexer;
}

interface MetricDef {
  key: keyof ProcessedIndexer;
  label: string;
  format: 'grt' | 'percent' | 'ppm' | 'number' | 'date';
  highlight: 'higher' | 'lower';
}

const METRICS: MetricDef[] = [
  { key: 'selfStake', label: 'Self Stake', format: 'grt', highlight: 'higher' },
  { key: 'delegated', label: 'Total Delegated', format: 'grt', highlight: 'higher' },
  { key: 'delegationCapacity', label: 'Delegation Capacity', format: 'percent', highlight: 'lower' },
  { key: 'rewardCut', label: 'Reward Cut (Raw)', format: 'ppm', highlight: 'lower' },
  { key: 'effectiveCut', label: 'Effective Cut', format: 'percent', highlight: 'lower' },
  { key: 'queryFeeCut', label: 'Query Fee Cut (%)', format: 'ppm', highlight: 'lower' },
  { key: 'estimatedAPR', label: 'Estimated Delegator APR', format: 'percent', highlight: 'higher' },
  { key: 'totalRewards', label: 'Total Rewards Earned', format: 'grt', highlight: 'higher' },
  { key: 'allocations', label: 'Active Allocations', format: 'number', highlight: 'higher' },
  { key: 'createdAt', label: 'Active Since', format: 'date', highlight: 'lower' },
];

// ---------- helpers ----------

function processIndexer(
  indexer: Indexer,
  delegationRatio: number,
  delegatorAPR: number | null,
  effectiveCutPercent: number | null,
): ProcessedIndexer {
  const selfStake = weiToGRT(indexer.stakedTokens) - weiToGRT(indexer.lockedTokens ?? '0');
  const delegated = weiToGRT(indexer.delegatedTokens);
  const totalRewards = weiToGRT(indexer.rewardsEarned);

  const capacity = calculateDelegationCapacity(selfStake, delegated, delegationRatio);

  // The raw cut stood in here for the effective one, which is lower wherever the indexer's own
  // stake is a real share of the pool: ellipfra's 43% is 38.7% to its delegators.
  const effectiveCut = effectiveCutPercent ?? (indexer.indexingRewardCut / 1_000_000) * 100;

  return {
    id: indexer.id,
    name: resolveIndexerName(indexer.account, indexer.id),
    selfStake,
    delegated,
    delegationCapacity: capacity.utilizationPercent,
    rewardCut: indexer.indexingRewardCut,
    effectiveCut,
    queryFeeCut: indexer.queryFeeCut,
    estimatedAPR: delegatorAPR,
    totalRewards,
    allocations: indexer.allocationCount,
    createdAt: indexer.createdAt,
    raw: indexer,
  };
}

function formatMetric(value: unknown, format: MetricDef['format']): string {
  switch (format) {
    case 'grt':
      return `${formatGRT(value as number)} GRT`;
    case 'percent':
      return value == null || !Number.isFinite(value as number) ? '—' : `${(value as number).toFixed(2)}%`;
    case 'ppm':
      return formatPPM(value as number);
    case 'number':
      return String(value);
    case 'date':
      return formatRelativeTime(value as number);
    default:
      return String(value);
  }
}

// ---------- search dropdown ----------

interface IndexerSearchProps {
  indexers: Indexer[];
  /** Why the list is empty, when it is empty for a reason other than there being no indexers. */
  unavailable?: string;
  nameMap?: Map<string, string>;
  selected: string | null;
  onSelect: (id: string) => void;
  placeholder?: string;
}

function IndexerSearch({
  indexers,
  nameMap,
  selected,
  onSelect,
  placeholder,
  unavailable,
}: IndexerSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return indexers.slice(0, 20);
    const q = query.toLowerCase();
    return indexers.filter(
      (ix) =>
        ix.id.toLowerCase().includes(q) ||
        (ix.account?.defaultDisplayName ?? '').toLowerCase().includes(q) ||
        (nameMap?.get(ix.id) ?? '').toLowerCase().includes(q),
    ).slice(0, 20);
  }, [indexers, nameMap, query]);

  const selectedName = useMemo(() => {
    if (!selected) return null;
    const enrichedName = nameMap?.get(selected);
    if (enrichedName) return enrichedName;
    const ix = indexers.find((i) => i.id === selected);
    return resolveIndexerName(ix?.account, selected);
  }, [indexers, nameMap, selected]);

  const directAddress = ADDRESS_RE.test(query.trim()) ? query.trim().toLowerCase() : null;
  const directMatch = directAddress && !filtered.some((ix) => ix.id.toLowerCase() === directAddress);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full px-3 py-2 text-sm rounded-[var(--radius-button)] text-left',
          'bg-[var(--bg-elevated)] border-[0.5px] border-[var(--border)]',
          'text-[var(--text)] hover:border-[var(--accent)] transition-colors',
          !selected && 'text-[var(--text-faint)]',
        )}
      >
        {selectedName || placeholder || 'Select indexer...'}
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] shadow-lg">
          <div className="p-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or address..."
              autoFocus
              className={cn(
                'w-full px-3 py-2 text-sm rounded-[var(--radius-button)]',
                'bg-[var(--bg-elevated)] border-[0.5px] border-[var(--border)]',
                'text-[var(--text)] placeholder:text-[var(--text-faint)]',
                'focus:outline-none focus:border-[var(--accent)]',
              )}
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {directMatch && (
              <button type="button" onClick={() => { onSelect(directAddress); setOpen(false); setQuery(''); }}
                className="w-full px-3 py-2 text-left text-sm text-[var(--accent-text)] hover:bg-[var(--bg-elevated)]">
                Compare {shortenAddress(directAddress)}
              </button>
            )}
            {filtered.map((ix) => {
              const name = nameMap?.get(ix.id) || resolveIndexerName(ix.account, ix.id);
              return (
                <button
                  key={ix.id}
                  type="button"
                  onClick={() => {
                    onSelect(ix.id);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)] transition-colors',
                    ix.id === selected && 'bg-[var(--accent-dim)]',
                  )}
                >
                  <p className="text-[var(--text)]">{name}</p>
                  <p className="text-xs font-mono text-[var(--text-faint)]">{shortenAddress(ix.id)}</p>
                </button>
              );
            })}
            {filtered.length === 0 && !directMatch && (
              <p className="px-3 py-4 text-sm text-[var(--text-faint)] text-center">
                {unavailable ?? 'No indexers found'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- page ----------

export default function ComparePage() {
  return (
    <Suspense fallback={<ChartSkeleton height="300px" />}>
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialA = searchParams.get('a');
  const initialB = searchParams.get('b');
  const initialC = searchParams.get('c');

  const [showThird, setShowThird] = useState(false);
  const selections = useMemo<(string | null)[]>(() => {
    const selected = [initialA, initialB];
    if (initialC || showThird) selected.push(initialC);
    return selected;
  }, [initialA, initialB, initialC, showThird]);

  const indexersState = useQueryState(
    useIndexers({ first: 1000, orderBy: 'stakedTokens', orderDirection: 'desc' }),
  );
  const indexersData = indexersState.kind === 'ready' ? indexersState.data : undefined;
  const indexersLoading = indexersState.kind === 'loading';
  const { data: enrichedData } = useEnrichedIndexers();
  const { data: networkData } = useNetworkStats();

  const delegationRatio = networkData?.graphNetwork?.delegationRatio ?? 16;
  const indexers = useMemo(() => indexersData?.indexers ?? [], [indexersData]);

  // Build maps from enriched data (has ENS names + allocation-level APR)
  const { nameMap, aprMap, cutMap } = useMemo(() => {
    const names = new Map<string, string>();
    const aprs = new Map<string, number>();
    const cuts = new Map<string, number | null>();
    const enrichedList = enrichedData && 'indexers' in enrichedData ? enrichedData.indexers : enrichedData ?? [];
    for (const e of enrichedList) {
      names.set(e.id, e.name ?? e.id);
      aprs.set(e.id, e.delegatorAPR);
      cuts.set(e.id, e.effectiveCut);
    }
    return { nameMap: names, aprMap: aprs, cutMap: cuts };
  }, [enrichedData]);

  const updateUrl = useCallback((idx: number, id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    const key = ['a', 'b', 'c'][idx];
    if (id) params.set(key, id);
    else params.delete(key);
    router.replace(`/compare?${params}`, { scroll: false });
  }, [router, searchParams]);

  const setSlot = useCallback((idx: number, id: string) => updateUrl(idx, id), [updateUrl]);

  const addSlot = useCallback(() => {
    setShowThird(true);
  }, []);

  const removeSlot = useCallback((idx: number) => {
    if (idx === 2) { setShowThird(false); updateUrl(2, null); }
  }, [updateUrl]);

  const detailQueries = useQueries({ queries: selections.map((id) => ({
    queryKey: ['indexerDetails', id],
    queryFn: () => fetchIndexerDetail(id!),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })) });
  const trendQueries = useQueries({ queries: selections.map((id) => ({
    queryKey: ['indexerTrends', id, 30],
    queryFn: () => fetchIndexerTrends(id!, 30),
    enabled: !!id,
    staleTime: 5 * 60_000,
  })) });
  const allocationMetrics = detailQueries.map((query, idx) => query.data
    ? allocationComparison(query.data, trendQueries[idx].data ?? null, networkData?.graphNetwork?.currentEpoch ?? null)
    : null);
  const commonDeployments = new Map<string, number>();
  for (const metrics of allocationMetrics) {
    if (!metrics) continue;
    for (const hash of metrics.deployments.keys()) {
      commonDeployments.set(hash, (commonDeployments.get(hash) ?? 0) + 1);
    }
  }
  const sharedHashes = [...commonDeployments].filter(([, count]) => count > 1).map(([hash]) => hash);
  const networkHashes = [...commonDeployments.keys()].sort();
  const networkQuery = useQuery({
    queryKey: ['compareDeploymentNetworks', networkHashes],
    queryFn: () => deploymentNetworks(networkHashes),
    enabled: networkHashes.length > 0,
    staleTime: 60 * 60_000,
  });
  const networkState = useQueryState(networkQuery);

  // APR is kittiwake's Instant figure. There is no share-of-3B fallback.
  const processed: (ProcessedIndexer | null)[] = useMemo(() => {
    return selections.map((sel) => {
      if (!sel) return null;
      const ix = indexers.find((i) => i.id.toLowerCase() === sel.toLowerCase())
        ?? detailQueries.find((q) => q.data?.id.toLowerCase() === sel.toLowerCase())?.data as Indexer | undefined;
      if (!ix) return null;
      const p = processIndexer(ix, delegationRatio, aprMap.get(sel) ?? null, cutMap.get(sel) ?? null);
      p.name = nameMap.get(sel) ?? p.name;
      return p;
    });
  }, [selections, indexers, detailQueries, delegationRatio, aprMap, cutMap, nameMap]);

  // Best values per metric
  const bestValues = useMemo(() => {
    const active = processed.filter(Boolean) as ProcessedIndexer[];
    if (active.length < 2) return {} as Record<string, number>;

    const result: Record<string, number> = {};
    for (const metric of METRICS) {
      const vals = active
        .map((p) => p[metric.key] as number | null)
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      if (vals.length === 0) continue;
      result[metric.key] =
        metric.highlight === 'higher' ? Math.max(...vals) : Math.min(...vals);
    }
    return result;
  }, [processed]);

  if (indexersLoading) {
    return <ChartSkeleton height="300px" />;
  }

  return (
    <div className="space-y-6">
      {/* Selection row */}
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${selections.length}, minmax(0, 1fr))${selections.length < 3 ? ' auto' : ''}` }}>
        {selections.map((sel, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-[var(--text-muted)]">
                Indexer {String.fromCharCode(65 + idx)}
              </label>
              {selections.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeSlot(idx)}
                  className="text-xs text-[var(--text-faint)] hover:text-[var(--red-text)] transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <IndexerSearch
              indexers={indexers}
              nameMap={nameMap}
              selected={sel}
              onSelect={(id) => setSlot(idx, id)}
              unavailable={unavailableReason(indexersState)}
            />
          </div>
        ))}

        {selections.length < 3 && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={addSlot}
              className={cn(
                'px-4 py-2 text-sm rounded-[var(--radius-button)]',
                'border-[0.5px] border-dashed border-[var(--border-mid)]',
                'text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent-text)]',
                'transition-colors',
              )}
            >
              + Add indexer
            </button>
          </div>
        )}
      </div>

      {/* Comparison table */}
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Side-by-Side Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--bg-elevated)]">
                  <th className="px-4 py-3 text-left text-[11px] font-medium text-[var(--text-muted)] sticky left-0 bg-[var(--bg-elevated)] z-10">
                    Metric
                  </th>
                  {processed.map((p, idx) => (
                    <th
                      key={idx}
                      className="px-4 py-3 text-center text-[11px] font-medium text-[var(--text)] min-w-[180px]"
                    >
                      {p ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="font-semibold text-sm normal-case">{p.name}</span>
                          <span className="text-[var(--text-faint)] font-mono text-xs normal-case">
                            {shortenAddress(p.id)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[var(--text-faint)] normal-case">Not selected</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {METRICS.map((metric) => (
                  <tr
                    key={metric.key}
                    className="border-b border-[0.5px] border-[var(--border)] hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-[var(--text-muted)] sticky left-0 bg-[var(--bg-surface)] z-10">
                      {metric.label}
                    </td>
                    {processed.map((p, idx) => {
                      if (!p) {
                        return (
                          <td key={idx} className="px-4 py-3 text-center text-sm text-[var(--text-faint)]">
                            --
                          </td>
                        );
                      }

                      const value = p[metric.key];
                      const isBest =
                        Object.keys(bestValues).length > 0 &&
                        value === bestValues[metric.key as string];

                      return (
                        <td
                          key={idx}
                          className={cn(
                            'px-4 py-3 text-center font-mono text-sm',
                            isBest ? 'text-[var(--accent-text)] font-semibold' : 'text-[var(--text)]',
                          )}
                        >
                          {formatMetric(value, metric.format)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="px-4 py-3 border-t border-[0.5px] border-[var(--border)] bg-[var(--bg-elevated)]">
            <p className="text-xs text-[var(--text-faint)]">
              Best value in each row is highlighted in accent colour. APR is the Instantaneous
              figure from the directory.
            </p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Allocation comparison</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {detailQueries.some((q, idx) => selections[idx] && q.isError) && (
            <p className="text-sm text-[var(--red-text)]">One or more indexer allocation profiles could not be loaded.</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className="text-left py-2">Measure</th>{selections.map((id, idx) => <th key={idx} className="text-right px-3">{id ? shortenAddress(id) : 'Not selected'}</th>)}</tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {([
                  ['Allocated stake', (m: NonNullable<typeof allocationMetrics[number]>) => `${formatGRT(m.allocatedGrt)} GRT`],
                  ['Top five deployment share', (m: NonNullable<typeof allocationMetrics[number]>) => m.topFiveShare == null ? '—' : `${(m.topFiveShare * 100).toFixed(1)}%`],
                  ['Stake weighted signal/stake', (m: NonNullable<typeof allocationMetrics[number]>) => m.weightedSignalStakeRatio?.toFixed(3) ?? '—'],
                  ['Average active allocation age', (m: NonNullable<typeof allocationMetrics[number]>) => m.meanAllocationEpochs == null ? '—' : `${m.meanAllocationEpochs.toFixed(1)} epochs`],
                  ['Average closed allocation lifetime', (m: NonNullable<typeof allocationMetrics[number]>) => m.meanCloseEpochs == null ? '—' : `${m.meanCloseEpochs.toFixed(1)} epochs`],
                  ['POI close interval', (m: NonNullable<typeof allocationMetrics[number]>) => m.poiCloseCadenceEpochs == null ? '—' : `${m.poiCloseCadenceEpochs.toFixed(1)} epochs`],
                  ['30 day indexer rewards per allocated GRT', (m: NonNullable<typeof allocationMetrics[number]>) => m.rewardPerAllocatedGrt30d == null ? '—' : `${m.rewardPerAllocatedGrt30d.toFixed(4)} GRT`],
                ] as const).map(([label, format]) => (
                  <tr key={label}><td className="py-2 text-[var(--text-muted)]">{label}</td>{allocationMetrics.map((m, idx) => <td key={idx} className="px-3 py-2 text-right font-mono">{m ? format(m) : selections[idx] && detailQueries[idx].fetchStatus === 'fetching' ? 'Loading…' : '—'}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-medium">Deployments in common</h3>
            {sharedHashes.length > 0 ? (
              <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
                {sharedHashes.map((hash) => <tr key={hash} className="border-t border-[var(--border)]"><td className="py-2 font-mono">{hash}</td>{allocationMetrics.map((m, idx) => <td key={idx} className="px-3 text-right font-mono">{m?.deployments.has(hash) ? `${formatGRT(m.deployments.get(hash)!)} GRT` : '—'}</td>)}</tr>)}
              </tbody></table></div>
            ) : <p className="text-xs text-[var(--text-muted)]">{allocationMetrics.filter(Boolean).length < 2 ? 'Select at least two indexers with readable allocations.' : 'These indexers have no active deployments in common.'}</p>}
          </div>
          <div>
            <h3 className="text-sm font-medium">Network mix by allocated stake</h3>
            <div className="grid gap-3 md:grid-cols-3 mt-2">
              {allocationMetrics.map((m, idx) => {
                const mix = new Map<string, number>();
                if (m && networkState.kind === 'ready') for (const [hash, stake] of m.deployments) {
                  const network = networkState.data.get(hash) ?? 'Unknown';
                  mix.set(network, (mix.get(network) ?? 0) + stake);
                }
                return <div key={idx} className="text-xs text-[var(--text-muted)]">
                  <p className="font-mono mb-1">{selections[idx] ? shortenAddress(selections[idx]) : 'Not selected'}</p>
                  {m && networkState.kind === 'loading' && <p>Reading manifests…</p>}
                  {m && (networkState.kind === 'failed' || networkState.kind === 'unreachable') && <p>Network mix could not be read.</p>}
                  {m && networkState.kind === 'ready' && [...mix].sort((a, b) => b[1] - a[1]).map(([network, stake]) =>
                    <p key={network}>{network}: {m.allocatedGrt > 0 ? (stake / m.allocatedGrt * 100).toFixed(1) : '0'}%</p>)}
                </div>;
              })}
            </div>
          </div>
          <p className="text-xs text-[var(--text-faint)]">Rewards use the last 30 daily totals divided by currently allocated stake. POI close interval is the mean gap between recorded allocation closes carrying a POI, across the latest 500 closes. It does not measure graph-node POI generation.</p>
        </CardContent>
      </Card>
    </div>
  );
}
