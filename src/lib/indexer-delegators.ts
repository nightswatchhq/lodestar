import type { IndexerDelegatorsPage, ServedDelegator } from '@/lib/contracts/indexer-delegators';
import { toCsv, weiToGRTExact } from '@/lib/csv';
import type { IndexerDetail } from '@/lib/contracts/indexer-detail';

export type DelegatorSortKey = 'stake' | 'delegatedAt' | 'lastChangeAt' | 'thawingTokens';
export type DelegatorSort = { key: DelegatorSortKey; dir: 'asc' | 'desc' };

export const DEFAULT_DELEGATOR_SORT: DelegatorSort = { key: 'stake', dir: 'desc' };

/** kittiwake's `/api/indexer` answers at most this many delegators. */
export const DETAIL_DELEGATOR_CAP = 100;

export function nextDelegatorSort(current: DelegatorSort, key: DelegatorSortKey): DelegatorSort {
  if (current.key === key) return { key, dir: current.dir === 'desc' ? 'asc' : 'desc' };
  return { key, dir: 'desc' };
}

/** One row of the table. Null is "not known from this source", never zero. */
export interface DelegatorRow {
  delegator: string;
  shareAmount: string;
  currentTokens: string | null;
  /** Fraction of the pool's shares, 0 to 1. */
  shareOfPool: number | null;
  thawingTokens: string | null;
  thawingUntil: number | null;
  lockedTokens: string | null;
  delegatedAt: number | null;
  lastChangeAt: number | null;
}

export interface DelegatorsView {
  rows: DelegatorRow[];
  /** How many rows can be paged through. Null when the source could not say. */
  total: number | null;
  /** Delegators still holding shares, when the source says. */
  active: number | null;
  /** The list is the old capped one, not every delegator. */
  partial: boolean;
  /** The old list carries shares only: no dates, nothing thawing, and no server-side sort. */
  fallback: boolean;
}

function big(v: string | null | undefined): bigint | null {
  if (v == null || !/^\d+$/.test(v)) return null;
  return BigInt(v);
}

/** Shares over pool shares, in exact integers until the last step. */
export function shareOfPool(shares: string, poolShares: string | null | undefined): number | null {
  const s = big(shares);
  const p = big(poolShares);
  if (s === null || p === null || p === BigInt(0)) return null;
  return Number((s * BigInt(1e12)) / p) / 1e12;
}

/** What `shares` are worth, as the contract values them: shares * pool tokens / pool shares. */
export function sharesToTokens(shares: string, poolShares: string | null | undefined, poolTokens: string | null | undefined): string | null {
  const s = big(shares);
  const p = big(poolShares);
  const t = big(poolTokens);
  if (s === null || p === null || t === null || p === BigInt(0)) return null;
  return ((s * t) / p).toString();
}

export function fromServedPage(page: IndexerDelegatorsPage): DelegatorsView {
  const poolShares = page.pool?.delegatorShares;
  return {
    rows: page.delegators.map((d) => ({
      delegator: d.delegator.id,
      shareAmount: d.shareAmount,
      currentTokens: d.currentTokens,
      shareOfPool: shareOfPool(d.shareAmount, poolShares),
      thawingTokens: d.thawingTokens,
      thawingUntil: d.thawingUntil,
      lockedTokens: d.lockedTokens,
      delegatedAt: d.delegatedAt,
      lastChangeAt: d.lastChangeAt,
    })),
    total: page.total,
    active: page.active,
    partial: false,
    fallback: false,
  };
}

/**
 * The list `/api/indexer` already carries, for a kittiwake without the delegators route. It is
 * the hundred with the most ever delegated, so a full hundred is not every delegator and says so.
 */
export function fromDetail(
  indexer: Pick<IndexerDetail, 'delegators' | 'delegatorShares' | 'delegatedTokens'>,
  sortDir: 'asc' | 'desc',
): DelegatorsView | null {
  if (!indexer.delegators) return null;
  const rows: DelegatorRow[] = indexer.delegators.map((d) => ({
    delegator: d.delegator.id,
    shareAmount: d.shareAmount,
    currentTokens: sharesToTokens(d.shareAmount, indexer.delegatorShares, indexer.delegatedTokens),
    shareOfPool: shareOfPool(d.shareAmount, indexer.delegatorShares),
    thawingTokens: null,
    thawingUntil: null,
    lockedTokens: null,
    delegatedAt: null,
    lastChangeAt: null,
  }));
  rows.sort((a, b) => {
    const x = BigInt(a.shareAmount);
    const y = BigInt(b.shareAmount);
    const c = x === y ? a.delegator.localeCompare(b.delegator) : x < y ? -1 : 1;
    return sortDir === 'asc' ? c : -c;
  });
  const partial = rows.length >= DETAIL_DELEGATOR_CAP;
  return {
    rows,
    total: rows.length,
    active: partial ? null : rows.length,
    partial,
    fallback: true,
  };
}

/** The tab's label: the count when it is known, a floor when only the capped list is. */
export function delegatorsTabLabel(
  indexer: Pick<IndexerDetail, 'delegators' | 'delegatorCount'>,
): string {
  if (indexer.delegatorCount != null) return `Delegators (${indexer.delegatorCount.toLocaleString('en-US')})`;
  const listed = indexer.delegators?.length;
  if (listed == null) return 'Delegators';
  return listed >= DETAIL_DELEGATOR_CAP ? `Delegators (${DETAIL_DELEGATOR_CAP}+)` : `Delegators (${listed})`;
}

/** An export pages through the served list; the largest indexer has over 100,000 delegators. */
export const DELEGATOR_EXPORT_CAP = 5_000;
const EXPORT_PAGE = 1_000;

/** Every delegator in stake order up to the cap, or a thrown error if the route is not served. */
export async function collectDelegators(
  fetchPage: (first: number, skip: number) => Promise<IndexerDelegatorsPage | null>,
): Promise<ServedDelegator[]> {
  const out: ServedDelegator[] = [];
  for (let skip = 0; skip < DELEGATOR_EXPORT_CAP; skip += EXPORT_PAGE) {
    const page = await fetchPage(EXPORT_PAGE, skip);
    if (!page) throw new Error('The delegator list is not served yet.');
    out.push(...page.delegators);
    if (page.delegators.length < EXPORT_PAGE) break;
  }
  return out.slice(0, DELEGATOR_EXPORT_CAP);
}

export function delegatorsCsv(rows: readonly ServedDelegator[]): string {
  const iso = (sec: number | null) => (sec == null ? null : new Date(sec * 1000).toISOString());
  return toCsv(
    ['rank', 'delegator', 'current_grt', 'shares', 'total_delegated_grt', 'thawing_grt', 'thawing_until', 'locked_grt', 'delegated_at', 'last_change_at'],
    rows.map((d, i) => [
      i + 1,
      d.delegator.id,
      weiToGRTExact(d.currentTokens),
      d.shareAmount,
      weiToGRTExact(d.totalDelegatedTokens),
      weiToGRTExact(d.thawingTokens),
      iso(d.thawingUntil),
      weiToGRTExact(d.lockedTokens),
      iso(d.delegatedAt),
      iso(d.lastChangeAt),
    ]),
  );
}

