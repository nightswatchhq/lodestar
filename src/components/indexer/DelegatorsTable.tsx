'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useENSName, useIndexerDelegators } from '@/hooks/useNetworkStats';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { Pagination } from '@/components/ui/Pagination';
import { SortHeader } from '@/components/ui/SortHeader';
import { MissingSection } from '@/components/indexer/MissingSection';
import { whyMissing, type IndexerDetail } from '@/lib/contracts/indexer-detail';
import {
  DEFAULT_DELEGATOR_SORT,
  DETAIL_DELEGATOR_CAP,
  fromDetail,
  fromServedPage,
  nextDelegatorSort,
  type DelegatorRow,
  type DelegatorSort,
  type DelegatorsView,
} from '@/lib/indexer-delegators';
import { formatGRT, formatNumber, shortenAddress, weiToGRT } from '@/lib/utils';

const PAGE_SIZE = 25;

function day(ts: number | null): string {
  return ts == null ? '—' : new Date(ts * 1000).toISOString().slice(0, 10);
}

function grt(wei: string | null): string {
  return wei == null ? '—' : `${formatGRT(weiToGRT(wei))} GRT`;
}

export function DelegatorsTable({
  address,
  indexer,
  nowSec,
  actions,
}: {
  address: string;
  indexer: IndexerDetail;
  nowSec: number;
  /** Beside the title, for controls that act on the whole list. */
  actions?: ReactNode;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<DelegatorSort>(DEFAULT_DELEGATOR_SORT);
  const [routeMissing, setRouteMissing] = useState(false);
  // Once the route is known to be missing, stay on the key that learned it, so paging the
  // fallback does not ask again for every page.
  const query = useIndexerDelegators(address, {
    first: PAGE_SIZE,
    skip: routeMissing ? 0 : page * PAGE_SIZE,
    orderBy: routeMissing ? DEFAULT_DELEGATOR_SORT.key : sort.key,
    orderDirection: routeMissing ? DEFAULT_DELEGATOR_SORT.dir : sort.dir,
  });
  if (query.data === null && !routeMissing) setRouteMissing(true);

  const served = query.data ? fromServedPage(query.data) : null;
  // A kittiwake without the route answers 404 (null); a failed read falls back the same way.
  const fallback = !served && (query.data === null || query.isError) ? fromDetail(indexer, sort.dir) : null;
  const view: DelegatorsView | null = served ?? fallback;

  if (!view) {
    if (query.isPending) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Delegators</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">Loading delegators…</p>
          </CardContent>
        </Card>
      );
    }
    return <MissingSection title="Delegators" what="The delegator list" detail={whyMissing(indexer, 'delegators')} />;
  }

  const rows = view.fallback ? view.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : view.rows;
  // Past the end of a served list no row carries the total; keep Prev usable to get back.
  const totalItems = view.total ?? page * PAGE_SIZE;
  const onSort = (key: DelegatorSort['key']) => {
    setSort(nextDelegatorSort(sort, key));
    setPage(0);
  };
  const header = (label: string, key: DelegatorSort['key'], title?: string) =>
    view.fallback && key !== 'stake' ? (
      <th scope="col" className="px-4 py-2 text-[11px] font-medium text-[var(--text-muted)] text-right" title={title}>
        {label}
      </th>
    ) : (
      <SortHeader label={label} sortKey={key} sort={sort} onSort={onSort} align="right" title={title} />
    );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Delegators</CardTitle>
            <p className="mt-1 text-xs text-[var(--text-faint)]">{summary(view)}</p>
          </div>
          {actions}
        </div>
      </CardHeader>
      <CardContent>
        {view.fallback ? (
          <p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-muted)]">
            {fallbackNote(view, query.isError)}
          </p>
        ) : null}
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
            {view.total === 0 ? 'Nobody delegates to this indexer.' : 'No delegators on this page.'}
          </p>
        ) : (
          <div className={query.isPlaceholderData ? 'overflow-x-auto opacity-60' : 'overflow-x-auto'}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="px-4 py-2 text-left text-[11px] font-medium text-[var(--text-muted)]">Delegator</th>
                  {header('Stake', 'stake', 'What the shares are worth now, at the pool rate.')}
                  <th scope="col" className="px-4 py-2 text-right text-[11px] font-medium text-[var(--text-muted)]">Share of pool</th>
                  {header('Delegated since', 'delegatedAt')}
                  {header('Last change', 'lastChangeAt')}
                  {header('Thawing', 'thawingTokens', 'Undelegated and not yet withdrawn.')}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((row) => (
                  <DelegatorTableRow key={row.delegator} row={row} nowSec={nowSec} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalItems > PAGE_SIZE || page > 0 ? (
          <Pagination page={page} pageSize={PAGE_SIZE} totalItems={totalItems} onPageChange={setPage} />
        ) : null}
      </CardContent>
    </Card>
  );
}

function summary(view: DelegatorsView): string {
  if (view.partial) return `The first ${DETAIL_DELEGATOR_CAP} only`;
  if (view.active == null || view.total == null) return '';
  const leaving = view.total - view.active;
  const delegating = `${formatNumber(view.active)} delegating`;
  return leaving > 0 ? `${delegating}, ${formatNumber(leaving)} more with tokens thawing` : delegating;
}

function fallbackNote(view: DelegatorsView, failed: boolean): string {
  const why = failed ? 'The full list could not be read, so this' : 'This';
  if (view.partial) {
    return `${why} is the ${DETAIL_DELEGATOR_CAP} delegators with the most ever delegated, not every delegator. Sorted by stake only; dates and thawing amounts are not available here.`;
  }
  return `${why} is every delegator, from the indexer's own answer. Dates and thawing amounts are not available here.`;
}

function DelegatorTableRow({ row, nowSec }: { row: DelegatorRow; nowSec: number }) {
  const thawing = row.thawingTokens != null && row.thawingTokens !== '0';
  const locked = row.lockedTokens != null && row.lockedTokens !== '0';
  return (
    <tr className="hover:bg-[var(--bg-elevated)]">
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 min-w-0">
          <Link
            href={`/delegators/${row.delegator}`}
            className="font-mono text-sm text-[var(--text)] hover:text-[var(--accent-text)] transition-colors truncate"
            title={row.delegator}
          >
            <DelegatorName address={row.delegator} />
          </Link>
          <CopyButton text={row.delegator} variant="icon" title="Copy address" />
        </span>
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text)] whitespace-nowrap">{grt(row.currentTokens)}</td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-muted)]">
        {row.shareOfPool == null ? '—' : row.shareOfPool === 0 ? '0%' : `${(row.shareOfPool * 100).toFixed(row.shareOfPool < 0.0001 ? 4 : 2)}%`}
      </td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-muted)]">{day(row.delegatedAt)}</td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-muted)]">{day(row.lastChangeAt)}</td>
      <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text-muted)] whitespace-nowrap">
        {row.thawingTokens == null ? '—' : thawing ? (
          <span title={row.thawingUntil != null ? `Thawing until ${day(row.thawingUntil)}` : undefined}>
            {grt(row.thawingTokens)}
            {row.thawingUntil != null ? (
              <span className="block text-xs text-[var(--text-faint)]">
                {row.thawingUntil > nowSec ? `until ${day(row.thawingUntil)}` : 'withdrawable'}
              </span>
            ) : null}
          </span>
        ) : locked ? null : '0'}
        {locked ? (
          <span className="block text-xs text-[var(--text-faint)]" title="Undelegated before Horizon and never withdrawn.">
            {grt(row.lockedTokens)} withdrawable
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function DelegatorName({ address }: { address: string }) {
  const { data } = useENSName(address);
  return <>{data?.ensName ?? shortenAddress(address, 6)}</>;
}
