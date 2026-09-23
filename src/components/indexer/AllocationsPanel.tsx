'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ActiveAllocation, ClosedAllocation } from '@/lib/contracts/indexer-detail';
import type { NodeState } from '@/lib/contracts/indexer-node';
import { allocationsWithStatus } from '@/lib/allocation-rows';
import {
  applyAllocTableState,
  parseAllocTableState,
  unifyActive,
  unifyClosed,
  filterAllocations,
  ageEpochs,
  ageDays,
  formatAgeLabel,
  createdAtSec,
  type AllocTableState,
  type AllocView,
  type UnifiedAllocation,
} from '@/lib/allocation-table';
import { columnClass, isColumnVisible, type ColumnSpec } from '@/lib/table-prefs';
import { useTablePrefs } from '@/hooks/useTablePrefs';
import { TableControls } from '@/components/ui/TableControls';
import { nextSort, sortAllocations } from '@/lib/allocation-sort';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Pagination } from '@/components/ui/Pagination';
import { SortHeader } from '@/components/ui/SortHeader';
import { CopyableId, truncatedQm } from '@/components/ui/CopyableId';
import { CopyButton } from '@/components/ui/CopyButton';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { queueCommand, queueBlock } from '@/lib/indexer-cli';
import { MissingSection } from '@/components/indexer/MissingSection';
import { formatGRT, weiToGRT, shortenAddress, formatRelativeTime, cn } from '@/lib/utils';
import { RATIO_TOOLTIP, signalStakeRatio, ratioVsNetwork } from '@/lib/allocation-ratio';
import { poiClock } from '@/lib/poi-clock';

const PAGE_SIZE = 25;

type AllocColumn = ColumnSpec & { views: readonly AllocView[] };
const ACTIVE: readonly AllocView[] = ['active', 'all'];
const CLOSED: readonly AllocView[] = ['closed', 'all'];
const BOTH: readonly AllocView[] = ['active', 'closed', 'all'];

/** What the column picker offers, each in the views that have it. Deployment always stays. */
const ALLOC_COLUMNS: readonly AllocColumn[] = [
  { id: 'status', label: 'Status', views: ACTIVE },
  { id: 'querySuccess', label: 'Query Success', views: ACTIVE },
  { id: 'blocksBehind', label: 'Blocks Behind', views: ACTIVE, hideBelow: 'sm' },
  { id: 'allocated', label: 'Allocated', views: BOTH },
  { id: 'signalled', label: 'Signalled', views: ACTIVE, hideBelow: 'lg' },
  { id: 'ratio', label: 'Ratio', views: ACTIVE },
  { id: 'age', label: 'Age', views: BOTH },
  { id: 'poi', label: 'POI', views: ACTIVE },
  { id: 'rewards', label: 'Indexing Rewards', views: CLOSED, hideBelow: 'sm' },
  { id: 'fees', label: 'Query Fees', views: CLOSED, hideBelow: 'md' },
  { id: 'closed', label: 'Closed', views: CLOSED },
];

/** Per column: null when not shown, otherwise the class it carries (a default breakpoint, or none). */
type ColumnClasses = Record<string, string | null>;

export function AllocationsPanel({
  allocations,
  closedAllocations,
  whyAllocations,
  whyClosed,
  statusDeployments,
  statusSummary,
  statusLoading,
  node,
  foghornSuccess,
  currentEpoch,
  epochLength,
  nowSec,
  networkRatio,
}: {
  allocations: ActiveAllocation[] | undefined;
  closedAllocations: ClosedAllocation[] | undefined;
  whyAllocations: string;
  whyClosed: string;
  statusDeployments: Parameters<typeof allocationsWithStatus>[1];
  statusSummary?: {
    syncedCount: number;
    syncingCount: number;
    failedCount: number;
    unreachableCount: number;
  };
  statusLoading: boolean;
  node: NodeState | null;
  foghornSuccess: (ipfsHash: string) => number | null | undefined;
  currentEpoch: number;
  epochLength: number;
  nowSec: number;
  networkRatio: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const state = parseAllocTableState(searchParams);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { copy, copied } = useCopyToClipboard();

  const setState = (patch: Partial<AllocTableState>) => {
    const next: AllocTableState = { ...state, ...patch };
    if (
      patch.view != null || patch.network !== undefined || patch.from !== undefined
      || patch.to !== undefined || patch.attention != null || patch.sort !== undefined
    ) {
      next.page = patch.page ?? 0;
    }
    const params = new URLSearchParams(searchParams.toString());
    applyAllocTableState(params, next);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  };

  const activeRows = allocations ? unifyActive(allocationsWithStatus(allocations, statusDeployments)) : [];
  const closedRows = closedAllocations ? unifyClosed(closedAllocations) : [];
  const combined = state.view === 'active' ? activeRows
    : state.view === 'closed' ? closedRows
    : [...activeRows, ...closedRows];
  const filtered = filterAllocations(combined, state, nowSec, currentEpoch, epochLength);
  const sorted = sortAllocations(filtered, state.sort, foghornSuccess);
  const page = Math.min(state.page, Math.max(0, Math.ceil(sorted.length / PAGE_SIZE) - 1));
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const networks = [...new Set(activeRows.map((r) => r.network).filter((n): n is string => !!n))].sort();
  const showActiveCols = state.view !== 'closed';

  const { columns: columnChoices, density, setColumns, setDensity } = useTablePrefs('allocations');
  const viewColumns = ALLOC_COLUMNS.filter((c) => c.views.includes(state.view));
  const cls: ColumnClasses = Object.fromEntries(
    ALLOC_COLUMNS.map((c) => [
      c.id,
      c.views.includes(state.view) && isColumnVisible(c, columnChoices) ? columnClass(c, columnChoices) : null,
    ]),
  );
  const onSort = (k: Parameters<typeof nextSort>[1]) => setState({ sort: nextSort(state.sort, k) });

  const allocationsMissing = allocations == null && (state.view === 'active' || state.view === 'all');
  const closedMissing = closedAllocations == null && (state.view === 'closed' || state.view === 'all');

  return (
    <div className="space-y-4">
      {allocationsMissing ? (
        <MissingSection title="Active Allocations" what="The active allocations" detail={whyAllocations} />
      ) : null}
      {closedMissing ? (
        <MissingSection title="Closed Allocations" what="The closed allocations" detail={whyClosed} />
      ) : null}

      {allocationsMissing && state.view === 'active' ? null : closedMissing && state.view === 'closed' ? null : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle>Allocations</CardTitle>
                {showActiveCols && statusSummary ? (
                  <StatusCounts summary={statusSummary} node={node} statusLoading={statusLoading} />
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ViewToggle value={state.view} onChange={(view) => setState({ view })} />
                <select
                  aria-label="Network"
                  value={state.network ?? 'all'}
                  onChange={(e) => setState({ network: e.target.value === 'all' ? null : e.target.value })}
                  className="px-2 py-1.5 text-xs rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                >
                  <option value="all">All networks</option>
                  {networks.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  From
                  <input
                    type="date"
                    value={state.from ?? ''}
                    onChange={(e) => setState({ from: e.target.value || null })}
                    className="px-2 py-1 text-xs rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                  To
                  <input
                    type="date"
                    value={state.to ?? ''}
                    onChange={(e) => setState({ to: e.target.value || null })}
                    className="px-2 py-1 text-xs rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setState({ attention: !state.attention })}
                  className={cn(
                    'px-2.5 py-1.5 text-xs rounded-[var(--radius-button)] border transition-colors',
                    state.attention
                      ? 'border-[var(--amber)] bg-[var(--amber-dim)] text-[var(--amber)]'
                      : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  Needs attention
                </button>
                {selected.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const lines = pageRows
                        .filter((r) => selected.has(r.allocationId) && r.lifecycle === 'active' && r.ipfsHash)
                        .map((r) => queueCommand('unallocate', {
                          deploymentId: r.ipfsHash,
                          allocationId: r.allocationId,
                          network: r.network,
                        }));
                      void copy(queueBlock(lines));
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    {copied ? 'Copied' : `Copy unallocate (${selected.size})`}
                  </button>
                ) : null}
                <TableControls
                  className="ml-auto"
                  specs={viewColumns}
                  columns={columnChoices}
                  onColumnsChange={setColumns}
                  density={density}
                  onDensityChange={setDensity}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {pageRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                No allocations in this view.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="px-2 py-2 w-8" />
                      <SortHeader label="Deployment" sortKey="deployment" sort={state.sort} onSort={onSort} />
                      {cls.status != null ? (
                        <SortHeader label="Status" sortKey="status" sort={state.sort} onSort={onSort} className={cls.status} />
                      ) : null}
                      {cls.querySuccess != null ? (
                        <SortHeader label="Query Success" sortKey="querySuccess" sort={state.sort} onSort={onSort} align="right" className={cls.querySuccess} title="Foghorn: share of queries answered with HTTP 200 on this deployment (QoS oracle)." />
                      ) : null}
                      {cls.blocksBehind != null ? (
                        <SortHeader label="Blocks Behind" sortKey="blocksBehind" sort={state.sort} onSort={onSort} align="right" className={cls.blocksBehind} />
                      ) : null}
                      {cls.allocated != null ? (
                        <SortHeader label="Allocated" sortKey="allocated" sort={state.sort} onSort={onSort} align="right" className={cls.allocated} />
                      ) : null}
                      {cls.signalled != null ? (
                        <SortHeader label="Signalled" sortKey="signalled" sort={state.sort} onSort={onSort} align="right" className={cls.signalled} />
                      ) : null}
                      {cls.ratio != null ? (
                        <SortHeader label="Ratio" sortKey="ratio" sort={state.sort} onSort={onSort} align="right" className={cls.ratio} title={RATIO_TOOLTIP} />
                      ) : null}
                      {cls.age != null ? (
                        <SortHeader label="Age" sortKey="age" sort={state.sort} onSort={onSort} align="right" className={cls.age} title="Epochs and days since the allocation opened, or its duration once closed." />
                      ) : null}
                      {cls.poi != null ? (
                        <SortHeader label="POI" sortKey="poi" sort={state.sort} onSort={onSort} align="right" className={cls.poi} title="Days since the last POI, or since creation if none, and days left before anyone can force-close." />
                      ) : null}
                      {cls.rewards != null ? (
                        <SortHeader label="Indexing Rewards" sortKey="rewards" sort={state.sort} onSort={onSort} align="right" className={cls.rewards} />
                      ) : null}
                      {cls.fees != null ? (
                        <SortHeader label="Query Fees" sortKey="fees" sort={state.sort} onSort={onSort} align="right" className={cls.fees} />
                      ) : null}
                      {cls.closed != null ? (
                        <SortHeader label="Closed" sortKey="closed" sort={state.sort} onSort={onSort} align="right" className={cls.closed} />
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {pageRows.map((row) => (
                      <AllocRow
                        key={row.allocationId}
                        row={row}
                        selected={selected.has(row.allocationId)}
                        onToggle={() => setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(row.allocationId)) next.delete(row.allocationId);
                          else next.add(row.allocationId);
                          return next;
                        })}
                        showActiveCols={showActiveCols}
                        cls={cls}
                        compact={density === 'compact'}
                        statusLoading={statusLoading}
                        node={node}
                        foghornSuccess={foghornSuccess}
                        currentEpoch={currentEpoch}
                        epochLength={epochLength}
                        nowSec={nowSec}
                        networkRatio={networkRatio}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sorted.length > PAGE_SIZE ? (
              <Pagination page={page} pageSize={PAGE_SIZE} totalItems={sorted.length} onPageChange={(p) => setState({ page: p })} />
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ViewToggle({ value, onChange }: { value: AllocTableState['view']; onChange: (v: AllocTableState['view']) => void }) {
  return (
    <div className="inline-flex rounded-[var(--radius-button)] border border-[var(--border)] p-0.5">
      {(['active', 'closed', 'all'] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'px-2.5 py-1 text-xs capitalize rounded-[var(--radius-button)]',
            value === v ? 'bg-[var(--bg-elevated)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function StatusCounts({
  summary,
  node,
  statusLoading,
}: {
  summary: { syncedCount: number; syncingCount: number; failedCount: number; unreachableCount: number };
  node: NodeState | null;
  statusLoading: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-[var(--green)]" />
        {summary.syncedCount} synced
      </span>
      {summary.syncingCount > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--amber)]" />
          {summary.syncingCount} syncing
        </span>
      ) : null}
      {summary.failedCount > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[var(--red)]" />
          {summary.failedCount} failed
        </span>
      ) : null}
      {node?.kind === 'checking' ? (
        <span className="flex items-center gap-1.5 text-[var(--text-faint)]">
          <span className="w-2 h-2 rounded-full bg-[var(--text-faint)] animate-pulse" />
          checking the node
        </span>
      ) : summary.unreachableCount > 0 ? (
        <span
          className="flex items-center gap-1.5 text-[var(--text-faint)]"
          title={node?.kind === 'unreachable' ? `The indexer's node did not answer: ${node.note}` : undefined}
        >
          {summary.unreachableCount} unreachable
          {node?.kind === 'unreachable' ? <span className="text-[10px]">({node.note})</span> : null}
        </span>
      ) : null}
      {statusLoading ? <span className="text-[10px] text-[var(--text-faint)]">Loading…</span> : null}
    </div>
  );
}

function AllocRow({
  row,
  selected,
  onToggle,
  showActiveCols,
  cls,
  compact,
  statusLoading,
  node,
  foghornSuccess,
  currentEpoch,
  epochLength,
  nowSec,
  networkRatio,
}: {
  row: UnifiedAllocation;
  selected: boolean;
  onToggle: () => void;
  showActiveCols: boolean;
  cls: ColumnClasses;
  compact: boolean;
  statusLoading: boolean;
  node: NodeState | null;
  foghornSuccess: (ipfsHash: string) => number | null | undefined;
  currentEpoch: number;
  epochLength: number;
  nowSec: number;
  networkRatio: number;
}) {
  const statusColor = {
    synced: 'var(--green)',
    syncing: 'var(--amber)',
    failed: 'var(--red)',
    unreachable: 'var(--text-faint)',
  }[row.status];
  const statusLabel = {
    synced: 'Synced',
    syncing: 'Syncing',
    failed: 'Failed',
    unreachable: statusLoading || node?.kind === 'checking' ? 'Checking' : '—',
  }[row.status];
  const epochs = ageEpochs(row.createdAtEpoch, currentEpoch, row.closedAtEpoch);
  const days = ageDays(row.createdAtEpoch, currentEpoch, epochLength, row.closedAtEpoch, row.closedAt, nowSec);
  const rewards = row.indexingRewards != null ? weiToGRT(row.indexingRewards) : 0;
  const fees = row.queryFeesCollected != null ? weiToGRT(row.queryFeesCollected) : 0;
  const qos = row.ipfsHash ? foghornSuccess(row.ipfsHash) : null;
  const pad = compact ? 'px-3 py-1.5' : 'px-4 py-3';

  return (
    <tr className="hover:bg-[var(--bg-elevated)]">
      <td className={compact ? 'px-2 py-1.5' : 'px-2 py-3'}>
        <input
          type="checkbox"
          aria-label="Select allocation"
          checked={selected}
          onChange={onToggle}
          className="accent-[var(--accent)]"
        />
      </td>
      <td className={pad}>
        <div className="flex flex-col gap-0.5">
          <Link
            href={row.ipfsHash ? `/subgraphs/${row.ipfsHash}` : '#'}
            className="text-sm text-[var(--text)] hover:text-[var(--accent-text)] transition-colors truncate max-w-[200px]"
          >
            {row.displayName ?? shortenAddress(row.deploymentId)}
          </Link>
          {row.ipfsHash ? (
            <CopyableId value={row.ipfsHash} title="Copy hash" display={truncatedQm(row.ipfsHash)} className="text-[10px] text-[var(--text-faint)]" />
          ) : (
            <span className="text-[10px] font-mono text-[var(--text-faint)]">{shortenAddress(row.deploymentId)}</span>
          )}
          <CopyableId value={row.allocationId} title="Copy allocation ID" display={shortenAddress(row.allocationId)} className="text-[10px] text-[var(--text-faint)]" />
          {row.lifecycle === 'active' && row.ipfsHash ? (
            <CopyButton
              text={queueCommand('unallocate', {
                deploymentId: row.ipfsHash,
                allocationId: row.allocationId,
                network: row.network,
              })}
              variant="icon"
              title="Copy unallocate command"
              className="self-start mt-0.5"
            />
          ) : null}
          {row.lifecycle === 'closed' && showActiveCols ? (
            <span className="text-[10px] text-[var(--text-faint)]">closed</span>
          ) : null}
          {row.forceClosed ? (
            <span className="text-[10px] text-[var(--amber)]" title="Closed by another party (e.g. on subgraph deprecation)">force closed</span>
          ) : null}
          {row.lifecycle === 'closed' && row.poi ? (
            <CopyableId value={row.poi} title="Copy POI" display={shortenAddress(row.poi)} className="text-[10px] text-[var(--text-faint)]" />
          ) : null}
          {row.network ? (
            <span className="text-[10px] text-[var(--text-faint)]">{row.network}</span>
          ) : null}
        </div>
      </td>
      {cls.status != null ? (
          <td className={cn(pad, cls.status)}>
            {row.lifecycle === 'closed' ? (
              <span className="text-sm text-[var(--text-faint)]">—</span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
                <span className="text-sm" style={{ color: statusColor }}>{statusLabel}</span>
              </div>
            )}
            {row.lifecycle === 'active' && row.status === 'syncing' && row.syncProgress != null ? (
              <div className="mt-1.5 w-24 h-1 rounded-full bg-[var(--bg)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--amber)]" style={{ width: `${row.syncProgress}%` }} />
              </div>
            ) : null}
            {row.lifecycle === 'active' && row.status === 'failed' && row.fatalError ? (
              <p className="text-[10px] text-[var(--red-text)] mt-0.5 max-w-[200px] truncate" title={row.fatalError}>{row.fatalError}</p>
            ) : null}
          </td>
      ) : null}
      {cls.querySuccess != null ? (
          <td className={cn(pad, 'text-right', cls.querySuccess)}>
            {row.lifecycle === 'closed' || qos == null ? (
              <span className="text-sm text-[var(--text-faint)]">—</span>
            ) : (
              <span
                className="font-mono text-sm"
                style={{ color: qos * 100 >= 90 ? 'var(--green)' : qos * 100 >= 50 ? 'var(--amber)' : 'var(--red)' }}
              >
                {(qos * 100).toFixed(qos < 1 ? 1 : 0)}%
              </span>
            )}
          </td>
      ) : null}
      {cls.blocksBehind != null ? (
          <td className={cn(pad, 'text-right', cls.blocksBehind)}>
            {row.lifecycle === 'closed' || row.blocksBehind == null ? (
              <span className="text-sm text-[var(--text-faint)]">—</span>
            ) : (
              <span className={cn(
                'font-mono text-sm',
                row.blocksBehind <= 50 ? 'text-[var(--green)]' : row.blocksBehind <= 500 ? 'text-[var(--amber)]' : 'text-[var(--red-text)]',
              )}>
                {row.blocksBehind === 0 ? 'At head' : row.blocksBehind.toLocaleString()}
              </span>
            )}
          </td>
      ) : null}
      {cls.allocated != null ? (
        <td className={cn(pad, 'text-right', cls.allocated)}>
          <span className="font-mono text-sm text-[var(--text)]">{formatGRT(weiToGRT(row.allocatedTokens))}</span>
        </td>
      ) : null}
      {cls.signalled != null ? (
        <td className={cn(pad, 'text-right', cls.signalled)}>
          {row.lifecycle === 'closed' ? (
            <span className="text-sm text-[var(--text-faint)]">—</span>
          ) : (
            <span className="font-mono text-sm text-[var(--green)]">{formatGRT(weiToGRT(row.signalledTokens))}</span>
          )}
        </td>
      ) : null}
      {cls.ratio != null ? (
        <td className={cn(pad, 'text-right', cls.ratio)}>
          <RatioCell
            signal={weiToGRT(row.signalledTokens)}
            stake={weiToGRT(row.stakedTokens)}
            networkRatio={networkRatio}
            closed={row.lifecycle === 'closed'}
          />
        </td>
      ) : null}
      {cls.age != null ? (
        <td className={cn(pad, 'text-right', cls.age)}>
          <span className="font-mono text-sm text-[var(--text-muted)]">{formatAgeLabel(epochs, days)}</span>
        </td>
      ) : null}
      {cls.poi != null ? (
        <td className={cn(pad, 'text-right', cls.poi)}>
          {row.lifecycle === 'closed' ? (
            <span className="text-sm text-[var(--text-faint)]">—</span>
          ) : (
            <PoiCell
              lastPoiAt={row.lastPoiAt}
              createdAtSec={createdAtSec(row.createdAtEpoch, currentEpoch, epochLength, nowSec)}
              nowSec={nowSec}
            />
          )}
        </td>
      ) : null}
      {cls.rewards != null ? (
          <td className={cn(pad, 'text-right', cls.rewards)}>
            <span className="font-mono text-sm text-[var(--green)]">
              {row.lifecycle === 'closed' && rewards > 0 ? formatGRT(rewards) : '—'}
            </span>
          </td>
      ) : null}
      {cls.fees != null ? (
          <td className={cn(pad, 'text-right', cls.fees)}>
            <span className="font-mono text-sm text-[var(--text)]">
              {row.lifecycle === 'closed' && fees > 0 ? formatGRT(fees) : '—'}
            </span>
          </td>
      ) : null}
      {cls.closed != null ? (
          <td className={cn(pad, 'text-right', cls.closed)}>
            {row.lifecycle === 'closed' && row.closedAt != null ? (
              <span className="text-sm text-[var(--text-muted)]">{formatRelativeTime(row.closedAt)}</span>
            ) : (
              <span className="text-sm text-[var(--text-faint)]">—</span>
            )}
          </td>
      ) : null}
    </tr>
  );
}

function PoiCell({
  lastPoiAt,
  createdAtSec,
  nowSec,
}: {
  lastPoiAt: number | null;
  createdAtSec: number;
  nowSec: number;
}) {
  const clock = poiClock({ lastPoiAt, createdAtSec, nowSec });
  const color = clock.tone === 'fresh' ? 'text-[var(--green)]'
    : clock.tone === 'due' ? 'text-[var(--amber)]'
    : 'text-[var(--red-text)]';
  return (
    <span className={cn('text-xs font-medium', color)} title={`${clock.daysSince.toFixed(1)}d since last POI`}>
      {clock.label}
    </span>
  );
}

function RatioCell({
  signal,
  stake,
  networkRatio,
  closed,
}: {
  signal: number;
  stake: number;
  networkRatio: number;
  closed: boolean;
}) {
  if (closed) return <span className="text-sm text-[var(--text-faint)]">—</span>;
  const ratio = signalStakeRatio(signal, stake);
  if (ratio == null) return <span className="text-sm text-[var(--text-faint)]">—</span>;
  const vs = ratioVsNetwork(ratio, networkRatio);
  const above = vs != null && vs >= 1;
  return (
    <span
      className={cn('font-mono text-sm', above ? 'text-[var(--green)]' : 'text-[var(--text)]')}
      title={vs != null ? `${vs.toFixed(2)}× network average` : RATIO_TOOLTIP}
    >
      {ratio >= 1 ? ratio.toFixed(2) : ratio.toFixed(3)}
      {vs != null ? <span className="text-[10px] text-[var(--text-faint)] ml-1">{vs.toFixed(1)}×</span> : null}
    </span>
  );
}
