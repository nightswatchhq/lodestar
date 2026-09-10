'use client';

import { use } from 'react';
import Link from 'next/link';
import { usePOIDeployment } from '@/hooks/useNetworkStats';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { Badge } from '@/components/ui/Badge';
import { StatCard, StatGrid } from '@/components/ui/StatCard';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { formatGRT, formatPercent, formatNumber, cn } from '@/lib/utils';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';
import { isUnavailable, unavailableReason, useQueryState } from '@/hooks/useQueryState';

export default function POIDeploymentPage({
  params,
}: {
  params: Promise<{ deployment: string }>;
}) {
  const { deployment } = use(params);
  const query = useQueryState(usePOIDeployment(deployment));
  const detail = query.kind === 'ready' ? query.data : undefined;

  // A read that failed or never went out is not "no POIs for this deployment", which is what the
  // branch below says. It used to be reached by `error || !detail`, so both of those states landed
  // on it.
  if (isUnavailable(query)) {
    return (
      <div className="py-12">
        <SourceUnavailable what="This deployment's POIs" detail={unavailableReason(query)} />
      </div>
    );
  }

  if (query.kind !== 'ready') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-2">No POI Data</h2>
        <p className="text-[var(--text-muted)]">
          No closed allocations with POIs found for this deployment.
        </p>
        <p className="text-xs text-[var(--text-faint)] font-mono mt-2">{deployment}</p>
        <Link
          href="/poi"
          className={cn(
            'inline-flex items-center gap-2 mt-6 px-4 py-2 text-sm font-medium',
            'rounded-[var(--radius-button)] border border-[var(--border)]',
            'hover:border-[var(--accent-hover)] transition-colors'
          )}
        >
          Back to POI Dashboard
        </Link>
      </div>
    );
  }

  const totalDivergent = detail.epochs.reduce((s, e) => s + e.divergentCount, 0);
  const avgConsensus = detail.epochs.length > 0
    ? detail.epochs.reduce((s, e) => s + e.consensusPct, 0) / detail.epochs.length
    : 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl sm:text-2xl font-semibold text-[var(--text)]">POI Analysis</h1>
            {totalDivergent > 0 ? (
              <Badge variant="error">{totalDivergent} divergent</Badge>
            ) : (
              <Badge variant="success">Clean</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-xs sm:text-sm text-[var(--text-faint)] font-mono truncate">
              {detail.ipfsHash}
            </p>
            <CopyButton text={detail.ipfsHash} variant="icon" title="Copy hash" />
          </div>
        </div>
        <Link
          href="/poi"
          className={cn(
            'px-3 py-2 text-sm rounded-[var(--radius-button)]',
            'border border-[var(--border)] hover:border-[var(--accent-hover)]',
            'transition-colors flex-shrink-0'
          )}
        >
          Back to Dashboard
        </Link>
      </div>

      {/* Stats */}
      <StatGrid className="lg:grid-cols-4 xl:grid-cols-4">
        <StatCard
          label="Total Allocations"
          value={String(detail.totalAllocations)}
          subtitle={`${detail.epochs.length} epochs`}
        />
        <StatCard
          label="Unique Indexers"
          value={String(detail.uniqueIndexers)}
        />
        <StatCard
          label="Avg Consensus"
          value={formatPercent(avgConsensus)}
          delta={{
            value: 'stake-weighted',
            positive: avgConsensus >= 95,
          }}
        />
        <StatCard
          label="Signal / Stake"
          value={`${formatGRT(detail.signal)} / ${formatGRT(detail.stake)}`}
          subtitle="GRT"
        />
      </StatGrid>

      {/* Epoch-by-epoch breakdown */}
      {detail.epochs.map((epochGroup) => (
        <Card key={epochGroup.epoch}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle>Epoch {epochGroup.epoch}</CardTitle>
                {epochGroup.divergentCount > 0 ? (
                  <Badge variant="error">{epochGroup.divergentCount} divergent</Badge>
                ) : (
                  <Badge variant="success">Consensus</Badge>
                )}
              </div>
              <span className="text-sm font-mono text-[var(--text-muted)]">
                {epochGroup.realCount} real{epochGroup.zeroCount > 0 ? ` + ${epochGroup.zeroCount} empty` : ''}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {/* Consensus bar */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs text-[var(--text-faint)]">Consensus Agreement</span>
                <span className="text-sm font-mono text-[var(--text)]">
                  {formatPercent(epochGroup.consensusPct)}
                </span>
              </div>
              <ProgressBar
                value={epochGroup.consensusPct}
                variant={epochGroup.consensusPct === 100 ? 'teal' : epochGroup.consensusPct >= 90 ? 'accent' : 'orange'}
                size="md"
              />
            </div>

            {/* Consensus POI */}
            {epochGroup.consensusPoi && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--bg-elevated)]">
                <p className="text-xs text-[var(--text-faint)] mb-1">Consensus POI</p>
                <p className="font-mono text-xs text-[var(--text)] break-all">{epochGroup.consensusPoi}</p>
                <p className="text-xs text-[var(--text-faint)] mt-1">
                  {formatGRT(epochGroup.consensusStake)} GRT from {epochGroup.realCount} indexer{epochGroup.realCount !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Indexer list */}
            {/* Mobile cards */}
            <div className="block md:hidden space-y-2">
              {epochGroup.indexers.map((idx) => (
                <div
                  key={idx.indexer}
                  className={cn(
                    'p-3 rounded-lg border',
                    idx.isZeroPoi
                      ? 'border-[var(--border)] bg-[var(--bg-surface)] opacity-50'
                      : idx.isConsensus
                        ? 'border-[var(--border)] bg-[var(--bg-surface)]'
                        : 'border-[var(--red)] bg-[var(--red-dim)]'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Link
                      href={`/indexers/${idx.indexer}`}
                      className="font-medium text-sm text-[var(--text)] hover:text-[var(--accent-text)] transition-colors"
                    >
                      {idx.name}
                    </Link>
                    <IndexerStatusBadge entry={idx} />
                  </div>
                  {!idx.isZeroPoi && (
                    <p className="font-mono text-[10px] text-[var(--text-faint)] break-all mb-1">{idx.poi}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)]">{formatGRT(idx.stake)} GRT</p>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-[var(--text-muted)]">Indexer</th>
                    <th className="px-4 py-2 text-left text-[11px] font-medium text-[var(--text-muted)]">POI</th>
                    <th className="px-4 py-2 text-right text-[11px] font-medium text-[var(--text-muted)]">Stake</th>
                    <th className="px-4 py-2 text-center text-[11px] font-medium text-[var(--text-muted)]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {epochGroup.indexers.map((idx) => (
                    <tr
                      key={idx.indexer}
                      className={cn(
                        'transition-colors',
                        idx.isZeroPoi
                          ? 'opacity-40 hover:opacity-60'
                          : idx.isConsensus
                            ? 'hover:bg-[var(--bg-elevated)]'
                            : 'bg-[var(--red-dim)] hover:bg-[var(--red-dim)]'
                      )}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/indexers/${idx.indexer}`}
                          className="hover:text-[var(--accent-text)] transition-colors"
                        >
                          <p className="font-medium text-sm text-[var(--text)]">{idx.name}</p>
                          <p className="text-xs text-[var(--text-faint)] font-mono">
                            {idx.indexer.slice(0, 6)}...{idx.indexer.slice(-4)}
                          </p>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {idx.isZeroPoi ? (
                          <span className="text-xs text-[var(--text-faint)]">No POI submitted</span>
                        ) : (
                          <p className="font-mono text-xs text-[var(--text-muted)] truncate max-w-[280px]" title={idx.poi}>
                            {idx.poi}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-mono text-sm text-[var(--text)]">{formatGRT(idx.stake)} GRT</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <IndexerStatusBadge entry={idx} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}

      {detail.epochs.length === 0 && (
        <Card>
          <div className="p-8 text-center">
            <p className="text-[var(--text-muted)]">No real POIs submitted for this deployment, only empty allocation closes.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function IndexerStatusBadge({ entry }: { entry: { isZeroPoi: boolean; isConsensus: boolean } }) {
  if (entry.isZeroPoi) return <Badge variant="default">Empty</Badge>;
  if (entry.isConsensus) return <Badge variant="success">Match</Badge>;
  return <Badge variant="error">Divergent</Badge>;
}
