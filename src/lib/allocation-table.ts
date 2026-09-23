import type { ClosedAllocation } from '@/lib/contracts/indexer-detail';
import { SYNC_TOLERANCE_BLOCKS } from '@/lib/indexing-status-shape';
import type { AllocationSort, AllocationSortKey } from '@/lib/allocation-sort';
import { defaultDirection } from '@/lib/allocation-sort';
import type { AllocationRow } from '@/lib/allocation-rows';
import { poiClock, needsPoiAttention } from '@/lib/poi-clock';

/** Same post-merge L1 block time as `L1_BLOCKS_PER_YEAR` in network-math. */
const L1_BLOCK_SECONDS = 12.09;

export const ALLOC_VIEWS = ['active', 'closed', 'all'] as const;
export type AllocView = (typeof ALLOC_VIEWS)[number];

export type UnifiedAllocation = AllocationRow & {
  lifecycle: 'active' | 'closed';
  closedAtEpoch: number | null;
  closedAt: number | null;
  indexingRewards: string | null;
  queryFeesCollected: string | null;
  poi: string | null;
  forceClosed: boolean;
  lastPoiAt: number | null;
};

export type AllocTableState = {
  view: AllocView;
  sort: AllocationSort | null;
  page: number;
  network: string | null;
  from: string | null;
  to: string | null;
  attention: boolean;
};

const SORT_KEYS: readonly AllocationSortKey[] = [
  'deployment', 'status', 'querySuccess', 'blocksBehind', 'allocated', 'signalled',
  'age', 'rewards', 'fees', 'closed', 'ratio', 'poi', 'accrued',
];

export function parseAllocTableState(params: URLSearchParams): AllocTableState {
  const viewRaw = params.get('view');
  const view: AllocView = viewRaw && (ALLOC_VIEWS as readonly string[]).includes(viewRaw)
    ? (viewRaw as AllocView)
    : 'active';
  const sortKey = params.get('sort');
  const sort: AllocationSort | null =
    sortKey && (SORT_KEYS as readonly string[]).includes(sortKey)
      ? {
          key: sortKey as AllocationSortKey,
          dir: params.get('dir') === 'asc' ? 'asc' : params.get('dir') === 'desc' ? 'desc' : defaultDirection(sortKey as AllocationSortKey),
        }
      : null;
  const page = Math.max(0, Number(params.get('page')) || 0);
  const network = params.get('network');
  const from = params.get('from');
  const to = params.get('to');
  return {
    view,
    sort,
    page,
    network: network && network !== 'all' ? network : null,
    from: isoDate(from),
    to: isoDate(to),
    attention: params.get('attention') === '1',
  };
}

/** Writes allocation-table keys onto `params`, deleting defaults so the URL stays short. */
export function applyAllocTableState(params: URLSearchParams, state: AllocTableState): void {
  if (state.view === 'active') params.delete('view');
  else params.set('view', state.view);

  if (!state.sort) {
    params.delete('sort');
    params.delete('dir');
  } else {
    params.set('sort', state.sort.key);
    if (state.sort.dir === defaultDirection(state.sort.key)) params.delete('dir');
    else params.set('dir', state.sort.dir);
  }

  if (state.page <= 0) params.delete('page');
  else params.set('page', String(state.page));

  if (!state.network) params.delete('network');
  else params.set('network', state.network);

  if (!state.from) params.delete('from');
  else params.set('from', state.from);
  if (!state.to) params.delete('to');
  else params.set('to', state.to);

  if (!state.attention) params.delete('attention');
  else params.set('attention', '1');
}

function isoDate(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return raw;
}

export function unifyActive(rows: AllocationRow[]): UnifiedAllocation[] {
  return rows.map((r) => ({
    ...r,
    lifecycle: 'active' as const,
    closedAtEpoch: null,
    closedAt: null,
    indexingRewards: null,
    queryFeesCollected: null,
    poi: null,
    forceClosed: false,
    lastPoiAt: null,
  }));
}

export function unifyClosed(rows: ClosedAllocation[]): UnifiedAllocation[] {
  return rows.map((a) => ({
    allocationId: a.id,
    deploymentId: a.subgraphDeployment.id,
    ipfsHash: a.subgraphDeployment.ipfsHash ?? '',
    displayName: a.subgraphDeployment.displayName,
    allocatedTokens: a.allocatedTokens,
    signalledTokens: '0',
    stakedTokens: '0',
    createdAtEpoch: a.createdAtEpoch,
    status: 'unreachable' as const,
    lifecycle: 'closed' as const,
    closedAtEpoch: a.closedAtEpoch,
    closedAt: a.closedAt,
    indexingRewards: a.indexingRewards,
    queryFeesCollected: a.queryFeesCollected,
    poi: a.poi,
    forceClosed: a.forceClosed,
    lastPoiAt: null,
  }));
}

export function secondsPerEpoch(epochLengthBlocks: number): number {
  return epochLengthBlocks > 0 ? epochLengthBlocks * L1_BLOCK_SECONDS : 86_400;
}

export function ageEpochs(createdAtEpoch: number, currentEpoch: number, closedAtEpoch: number | null): number {
  const end = closedAtEpoch != null ? closedAtEpoch : currentEpoch;
  return Math.max(0, end - createdAtEpoch);
}

export function ageDays(
  createdAtEpoch: number,
  currentEpoch: number,
  epochLengthBlocks: number,
  closedAtEpoch: number | null,
  closedAt: number | null,
  nowSec: number,
): number {
  if (closedAt != null && closedAt > 0) {
    const opened = createdAtSec(createdAtEpoch, currentEpoch, epochLengthBlocks, nowSec);
    return Math.max(0, (closedAt - opened) / 86_400);
  }
  return ageEpochs(createdAtEpoch, currentEpoch, closedAtEpoch) * secondsPerEpoch(epochLengthBlocks) / 86_400;
}

export function createdAtSec(
  createdAtEpoch: number,
  currentEpoch: number,
  epochLengthBlocks: number,
  nowSec: number,
): number {
  return nowSec - ageEpochs(createdAtEpoch, currentEpoch, null) * secondsPerEpoch(epochLengthBlocks);
}

/**
 * Amber and red in the allocations table: failed, still syncing, or lag past the
 * synced tolerance. POI age from #249 joins this predicate when that field exists.
 */
export function needsAttention(
  row: UnifiedAllocation,
  nowSec?: number,
  currentEpoch?: number,
  epochLengthBlocks?: number,
): boolean {
  if (row.lifecycle !== 'active') return false;
  if (row.status === 'failed' || row.status === 'syncing') return true;
  if (row.blocksBehind != null && row.blocksBehind > SYNC_TOLERANCE_BLOCKS) return true;
  if (nowSec != null && currentEpoch != null && epochLengthBlocks != null) {
    const opened = createdAtSec(row.createdAtEpoch, currentEpoch, epochLengthBlocks, nowSec);
    return needsPoiAttention(poiClock({ lastPoiAt: row.lastPoiAt, createdAtSec: opened, nowSec }));
  }
  return false;
}

export function filterAllocations(
  rows: UnifiedAllocation[],
  state: AllocTableState,
  nowSec: number,
  currentEpoch: number,
  epochLengthBlocks: number,
): UnifiedAllocation[] {
  return rows.filter((row) => {
    if (state.view === 'active' && row.lifecycle !== 'active') return false;
    if (state.view === 'closed' && row.lifecycle !== 'closed') return false;
    if (state.network && row.network !== state.network) return false;
    if (state.attention && !needsAttention(row, nowSec, currentEpoch, epochLengthBlocks)) return false;
    if (state.from || state.to) {
      const t = eventAtSec(row, nowSec, currentEpoch, epochLengthBlocks);
      if (t == null) return false;
      if (state.from && t < Date.parse(`${state.from}T00:00:00Z`) / 1000) return false;
      if (state.to && t > Date.parse(`${state.to}T23:59:59Z`) / 1000) return false;
    }
    return true;
  });
}

export function formatAgeLabel(epochs: number, days: number): string {
  const d = days >= 10 ? String(Math.round(days)) : days.toFixed(1);
  return `${d}d · ${epochs} ep`;
}

function eventAtSec(
  row: UnifiedAllocation,
  nowSec: number,
  currentEpoch: number,
  epochLengthBlocks: number,
): number | null {
  if (row.lifecycle === 'closed') {
    if (row.closedAt != null && row.closedAt > 0) return row.closedAt;
    return createdAtSec(row.createdAtEpoch, currentEpoch, epochLengthBlocks, nowSec);
  }
  return createdAtSec(row.createdAtEpoch, currentEpoch, epochLengthBlocks, nowSec);
}
