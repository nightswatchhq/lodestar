export type AllocationSortKey =
  | 'deployment'
  | 'status'
  | 'querySuccess'
  | 'blocksBehind'
  | 'allocated'
  | 'signalled'
  | 'age'
  | 'rewards'
  | 'fees'
  | 'closed'
  | 'ratio'
  | 'poi';

export type SortDirection = 'asc' | 'desc';

export interface AllocationSort {
  key: AllocationSortKey;
  dir: SortDirection;
}

export interface SortableAllocation {
  allocationId?: string;
  deploymentId: string;
  ipfsHash: string;
  displayName?: string | null;
  status: 'synced' | 'syncing' | 'failed' | 'unreachable';
  blocksBehind?: number | null;
  allocatedTokens: string;
  signalledTokens: string;
  stakedTokens?: string;
  createdAtEpoch?: number;
  closedAtEpoch?: number | null;
  closedAt?: number | null;
  indexingRewards?: string | null;
  queryFeesCollected?: string | null;
  lifecycle?: 'active' | 'closed';
  lastPoiAt?: number | null;
  createdAtSec?: number;
  nowSec?: number;
}

const STATUS_ORDER: Record<SortableAllocation['status'], number> = { synced: 0, syncing: 1, failed: 2, unreachable: 3 };

/** Names and status read best from the top of the alphabet or the healthiest; amounts, age and lag from the largest. */
export function defaultDirection(key: AllocationSortKey): SortDirection {
  return key === 'deployment' || key === 'status' ? 'asc' : 'desc';
}

/** The same column flips direction; a new column starts in its default. */
export function nextSort(current: AllocationSort | null, key: AllocationSortKey): AllocationSort {
  if (current?.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: defaultDirection(key) };
}

function wei(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function value(row: SortableAllocation, key: AllocationSortKey, successRate: (ipfsHash: string) => number | null | undefined): string | number | bigint | null {
  switch (key) {
    case 'deployment':
      // What the cell shows: the name, else the deployment ID it is shortened from.
      return (row.displayName ?? row.deploymentId).toLowerCase();
    case 'status':
      return STATUS_ORDER[row.status];
    case 'querySuccess':
      return row.ipfsHash ? (successRate(row.ipfsHash) ?? null) : null;
    case 'blocksBehind':
      return row.blocksBehind ?? null;
    case 'allocated':
      return wei(row.allocatedTokens);
    case 'signalled':
      return wei(row.signalledTokens);
    case 'age':
      if (row.createdAtEpoch == null) return null;
      return (row.closedAtEpoch ?? 1_000_000_000) - row.createdAtEpoch;
    case 'rewards':
      return row.indexingRewards != null ? wei(row.indexingRewards) : null;
    case 'fees':
      return row.queryFeesCollected != null ? wei(row.queryFeesCollected) : null;
    case 'closed':
      return row.closedAt ?? row.closedAtEpoch ?? null;
    case 'ratio': {
      if (!row.stakedTokens) return null;
      const sig = wei(row.signalledTokens);
      const st = wei(row.stakedTokens);
      if (sig == null || st == null || st === 0n) return null;
      return Number(sig) / Number(st);
    }
    case 'poi':
      if (row.lifecycle === 'closed' || row.nowSec == null || row.createdAtSec == null) return null;
      return (row.lastPoiAt ?? row.createdAtSec) - row.nowSec;
  }
}

/**
 * Sorted copy of the rows. A missing figure sorts last in either direction, so flipping a column never
 * floods the first page with dashes, and equal figures keep deployment order so paging is stable.
 */
export function sortAllocations<T extends SortableAllocation>(
  rows: readonly T[],
  sort: AllocationSort | null,
  successRate: (ipfsHash: string) => number | null | undefined,
): T[] {
  if (!sort) return [...rows];
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = value(a, sort.key, successRate);
    const vb = value(b, sort.key, successRate);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) {
      return (va < vb ? -1 : 1) * sign;
    }
    if (a.deploymentId !== b.deploymentId) {
      return a.deploymentId < b.deploymentId ? -1 : 1;
    }
    const idA = a.allocationId ?? '';
    const idB = b.allocationId ?? '';
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
}
