/**
 * The Studio migration view: deployments on the chains the Foundation is moving off Subgraph
 * Studio that carry curation signal and have no indexer on them.
 *
 * The directory can filter one network at a time and knows nothing about when signal arrived, so
 * this module asks it once per network and then reads each deployment's curator rows for the
 * latest signal change. Everything here is pure; the page does the fetching.
 */

import type { CuratorSignalEntry, DirectoryRow } from '@/lib/api';
import { emptyDirectoryState, toggleUnallocated, type DirectoryState } from '@/lib/subgraph-directory';
import { weiToGRT } from '@/lib/utils';

/** BNB Smart Chain and Polygon, as their manifests name them. The first two chains, not the last. */
export const MIGRATION_NETWORKS: readonly string[] = ['bsc', 'matic'];

/** Studio query traffic moves to the network. */
export const MIGRATION_START = '2026-10-08';
/** Studio stops serving the migrating subgraphs. */
export const STUDIO_SUPPORT_ENDS = '2026-10-31';
/** Curation the Foundation's bot adds is guaranteed only until the start date. */
export const CURATION_GUARANTEED_UNTIL = MIGRATION_START;

/** Below this much signal a deployment does not count towards REO's active-day test. */
export const REO_SIGNAL_FLOOR_GRT = 500;

/** Rows to read curator signals for. Past this the page says what it left unread. */
export const SIGNAL_AGE_ROWS = 150;

/** A `network` query value: comma-separated manifest names, or the default pair. Unknown names pass; the directory answers them empty. */
export function parseNetworks(param: string | null): string[] {
  const names = (param ?? '')
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter((n) => /^[a-z0-9-]+$/.test(n));
  return names.length ? [...new Set(names)] : [...MIGRATION_NETWORKS];
}

/** The directory state the view is: one network, signalled, unallocated, most signal first. */
export function migrationState(network: string): DirectoryState {
  return { ...toggleUnallocated(emptyDirectoryState()), network };
}

export interface MigrationRow {
  id: string;
  ipfsHash: string;
  displayName: string | null;
  network: string;
  signalGrt: number;
  curatorCount: number;
  createdAt: number;
  /** Unix seconds of the latest signal change, or null where the curator rows were not read. */
  signalledAt: number | null;
  belowReoFloor: boolean;
}

export function migrationRow(d: DirectoryRow, signalledAt: number | null): MigrationRow {
  const signalGrt = weiToGRT(d.signalledTokens);
  return {
    id: d.id,
    ipfsHash: d.ipfsHash,
    displayName: d.displayName,
    network: d.network ?? '',
    signalGrt,
    curatorCount: d.curatorCount,
    createdAt: d.createdAt,
    signalledAt,
    belowReoFloor: signalGrt < REO_SIGNAL_FLOOR_GRT,
  };
}

/**
 * When signal last moved on a deployment: the latest change across its curators. A curator whose
 * signal is gone is not in the rows, so this is the last time somebody put signal on, or topped
 * it up, and not the first.
 */
export function latestSignalChange(signals: Pick<CuratorSignalEntry, 'lastSignalChange'>[]): number | null {
  let latest = 0;
  for (const s of signals) if (s.lastSignalChange > latest) latest = s.lastSignalChange;
  return latest > 0 ? latest : null;
}

/** Newest signal first; rows with no reading after those with one; then the most signal. */
export function sortBySignalAge(rows: MigrationRow[]): MigrationRow[] {
  return [...rows].sort((a, b) => {
    if (a.signalledAt !== null && b.signalledAt !== null && a.signalledAt !== b.signalledAt) {
      return b.signalledAt - a.signalledAt;
    }
    if ((a.signalledAt === null) !== (b.signalledAt === null)) return a.signalledAt === null ? 1 : -1;
    return b.signalGrt - a.signalGrt;
  });
}

/** Whole days since `ts`, as "today", "1 day ago", "12 days ago". */
export function signalAgeLabel(ts: number, nowMs = Date.now()): string {
  const days = Math.floor((nowMs / 1000 - ts) / 86_400);
  if (days <= 0) return 'today';
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Whether the migration date has passed, so the page's tense can follow it. */
export function migrationStarted(nowMs = Date.now()): boolean {
  return nowMs >= Date.parse(`${MIGRATION_START}T00:00:00Z`);
}
