'use client';

import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { CopyableId, truncatedQm } from '@/components/ui/CopyableId';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';
import { WatchStar } from '@/components/ui/WatchStar';
import { useEnrichedIndexers } from '@/hooks/useNetworkStats';
import { unavailableReason, useQueryState } from '@/hooks/useQueryState';
import { useWatchlist } from '@/hooks/useWatchlist';
import { fetchSubgraphDeployment } from '@/lib/api';
import type { EnrichedIndexer } from '@/lib/enriched';
import { signalStakeRatio } from '@/lib/allocation-ratio';
import { cn, formatGRT, formatPPM, isGreedyCut, shortenAddress, weiToGRT } from '@/lib/utils';

const th = 'px-4 py-2 text-[11px] font-medium text-[var(--text-muted)] whitespace-nowrap';
const td = 'px-4 py-3';
const dash = <span className="text-[var(--text-faint)]">—</span>;

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-[var(--text-muted)]">{children}</p>;
}

function IndexerRows({ addresses }: { addresses: string[] }) {
  const state = useQueryState(useEnrichedIndexers(addresses.length > 0));
  if (state.kind === 'loading') return <div className="h-24 animate-pulse rounded bg-[var(--bg-elevated)]" />;
  if (state.kind === 'failed' || state.kind === 'unreachable') {
    return <SourceUnavailable what="The indexer directory" detail={unavailableReason(state)} />;
  }
  const byId = new Map<string, EnrichedIndexer>(
    (state.kind === 'ready' ? state.data.indexers : []).map((i) => [i.id.toLowerCase(), i]),
  );

  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th scope="col" className={cn(th, 'text-left')}>Indexer</th>
            <th scope="col" className={cn(th, 'text-right')}>Score</th>
            <th scope="col" className={cn(th, 'text-right')}>Self-Stake</th>
            <th scope="col" className={cn(th, 'text-right')}>Delegated</th>
            <th scope="col" className={cn(th, 'text-right hidden sm:table-cell')}>Capacity</th>
            <th scope="col" className={cn(th, 'text-right')}>Reward Cut</th>
            <th scope="col" className={cn(th, 'text-right')}>APY 90d</th>
            <th scope="col" className={cn(th, 'text-right hidden md:table-cell')}>Allocations</th>
            <th scope="col" className={cn(th, 'text-right hidden md:table-cell')}>Eligible</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {addresses.map((address) => {
            const i = byId.get(address);
            return (
              <tr key={address} className="hover:bg-[var(--bg-elevated)]">
                <td className={td}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <WatchStar kind="indexer" id={address} />
                    <div className="min-w-0">
                      <Link href={`/indexers/${address}`} className="font-medium text-[var(--text)] hover:text-[var(--accent-text)]">
                        {i?.name ?? shortenAddress(address)}
                      </Link>
                      <CopyableId value={address} title="Copy address" display={shortenAddress(address)} className="block text-xs text-[var(--text-faint)]" />
                    </div>
                  </div>
                  {!i && state.kind === 'ready' ? (
                    <p className="text-[10px] text-[var(--text-faint)] mt-0.5 ml-6">Not in the directory</p>
                  ) : null}
                </td>
                <td className={cn(td, 'text-right font-mono')}>
                  {i ? <>{i.score}<span className="ml-1 text-[11px] opacity-70">{i.scoreGrade}</span></> : dash}
                </td>
                <td className={cn(td, 'text-right font-mono')}>{i ? `${formatGRT(i.selfStakeGRT)} GRT` : dash}</td>
                <td className={cn(td, 'text-right font-mono text-[var(--green)]')}>{i ? `${formatGRT(i.delegatedGRT)} GRT` : dash}</td>
                <td className={cn(td, 'text-right font-mono hidden sm:table-cell')}>
                  {i ? `${i.delegationCapacity.utilizationPercent.toFixed(1)}%` : dash}
                </td>
                <td className={cn(td, 'text-right font-mono', i && isGreedyCut(i.indexingRewardCut) && 'text-[var(--red-text)] font-semibold')}>
                  {i ? formatPPM(i.indexingRewardCut) : dash}
                </td>
                <td className={cn(td, 'text-right font-mono')}>
                  {i?.rollingAPY90d != null ? `${i.rollingAPY90d.toFixed(2)}%` : dash}
                </td>
                <td className={cn(td, 'text-right font-mono hidden md:table-cell')}>{i ? i.allocationCount : dash}</td>
                <td className={cn(td, 'text-right hidden md:table-cell')}>
                  {i ? (
                    <span className={cn('inline-block w-2 h-2 rounded-full', i.reoStatus === 'eligible' ? 'bg-[var(--green)]' : i.reoStatus === 'ineligible' ? 'bg-[var(--red)]' : 'bg-[var(--text-faint)]')} title={`Rewards eligibility: ${i.reoStatus}`} />
                  ) : dash}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SubgraphRows({ hashes }: { hashes: string[] }) {
  const queries = useQueries({
    queries: hashes.map((hash) => ({
      queryKey: ['subgraphDeployment', hash],
      queryFn: () => fetchSubgraphDeployment(hash),
      staleTime: 5 * 60 * 1000,
    })),
  });

  return (
    <div className="overflow-x-auto -mx-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th scope="col" className={cn(th, 'text-left')}>Deployment</th>
            <th scope="col" className={cn(th, 'text-right')}>Signal</th>
            <th scope="col" className={cn(th, 'text-right')}>Stake</th>
            <th scope="col" className={cn(th, 'text-right')}>Signal/Stake</th>
            <th scope="col" className={cn(th, 'text-right hidden sm:table-cell')}>Query Fees</th>
            <th scope="col" className={cn(th, 'text-right')}>Indexers</th>
            <th scope="col" className={cn(th, 'text-right hidden md:table-cell')}>Curators</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {hashes.map((hash, n) => {
            const q = queries[n];
            const d = q?.data ?? null;
            const signal = d ? weiToGRT(d.signalledTokens) : 0;
            const stake = d ? weiToGRT(d.stakedTokens) : 0;
            const ratio = d ? signalStakeRatio(signal, stake) : null;
            const note = q?.isError ? 'Could not be read' : q?.isSuccess && !d ? 'Not found' : null;
            return (
              <tr key={hash} className="hover:bg-[var(--bg-elevated)]">
                <td className={td}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <WatchStar kind="subgraph" id={hash} />
                    <div className="min-w-0">
                      <Link href={`/subgraphs/${hash}`} className="font-medium text-[var(--text)] hover:text-[var(--accent-text)] truncate block max-w-[260px]">
                        {d?.displayName ?? truncatedQm(hash)}
                      </Link>
                      <CopyableId value={hash} title="Copy hash" display={truncatedQm(hash)} className="block text-xs text-[var(--text-faint)]" />
                    </div>
                  </div>
                  {note ? <p className="text-[10px] text-[var(--text-faint)] mt-0.5 ml-6">{note}</p> : null}
                </td>
                <td className={cn(td, 'text-right font-mono')}>{d ? formatGRT(signal) : dash}</td>
                <td className={cn(td, 'text-right font-mono')}>{d ? formatGRT(stake) : dash}</td>
                <td className={cn(td, 'text-right font-mono')}>
                  {d ? (ratio === null ? <span title="Nothing allocated against this signal">∞</span> : ratio.toFixed(3)) : dash}
                </td>
                <td className={cn(td, 'text-right font-mono hidden sm:table-cell')}>{d ? formatGRT(weiToGRT(d.queryFeesAmount)) : dash}</td>
                <td className={cn(td, 'text-right font-mono')}>{d ? d.indexerAllocations.length : dash}</td>
                <td className={cn(td, 'text-right font-mono hidden md:table-cell')}>{d ? d.curatorSignals.length : dash}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Watchlist() {
  const { list } = useWatchlist();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Watchlist</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl">
          The indexers and subgraphs you have starred. Star one from its row in a directory or from its
          own page. The list is kept in this browser only, so it does not follow you to another device.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Indexers <span className="font-mono text-xs text-[var(--text-faint)]">{list.indexers.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.indexers.length ? (
            <IndexerRows addresses={list.indexers} />
          ) : (
            <Empty>
              No indexers yet. Star one in the{' '}
              <Link href="/indexers" className="text-[var(--accent-text)] hover:underline">indexer directory</Link>.
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Subgraphs <span className="font-mono text-xs text-[var(--text-faint)]">{list.subgraphs.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {list.subgraphs.length ? (
            <SubgraphRows hashes={list.subgraphs} />
          ) : (
            <Empty>
              No subgraphs yet. Star one in the{' '}
              <Link href="/subgraphs" className="text-[var(--accent-text)] hover:underline">subgraph directory</Link>.
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
