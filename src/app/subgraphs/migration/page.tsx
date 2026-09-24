'use client';

import { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { CopyableId, truncatedQm } from '@/components/ui/CopyableId';
import { WatchStar } from '@/components/ui/WatchStar';
import { fetchSubgraphCuration, fetchSubgraphDirectory, type DirectoryRow } from '@/lib/api';
import { directoryParams, fetchWholeDirectory } from '@/lib/subgraph-directory';
import {
  CURATION_GUARANTEED_UNTIL,
  MIGRATION_START,
  REO_SIGNAL_FLOOR_GRT,
  SIGNAL_AGE_ROWS,
  STUDIO_SUPPORT_ENDS,
  latestSignalChange,
  migrationRow,
  migrationStarted,
  migrationState,
  parseNetworks,
  signalAgeLabel,
  sortBySignalAge,
} from '@/lib/studio-migration';
import { cn, formatGRT } from '@/lib/utils';

const FIVE_MINUTES = 5 * 60 * 1000;

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function StudioMigrationPage() {
  return (
    <Suspense fallback={<ChartSkeleton height="600px" />}>
      <StudioMigration />
    </Suspense>
  );
}

function StudioMigration() {
  const networks = parseNetworks(useSearchParams().get('network'));

  const directory = useQuery({
    queryKey: ['studioMigration', networks],
    queryFn: async () => {
      const pages = await Promise.all(
        networks.map((n) => fetchWholeDirectory(migrationState(n), fetchSubgraphDirectory)),
      );
      return pages.flat();
    },
    staleTime: FIVE_MINUTES,
    refetchInterval: FIVE_MINUTES,
  });

  // The largest signal first, so a cap lands on the rows least worth reading.
  const toRead: DirectoryRow[] = useMemo(
    () => [...(directory.data ?? [])].sort((a, b) => Number(BigInt(b.signalledTokens) - BigInt(a.signalledTokens))).slice(0, SIGNAL_AGE_ROWS),
    [directory.data],
  );
  const ages = useQueries({
    queries: toRead.map((d) => ({
      queryKey: ['subgraphCuration', d.ipfsHash],
      queryFn: () => fetchSubgraphCuration(d.ipfsHash),
      staleTime: FIVE_MINUTES,
      retry: 1,
    })),
  });
  const signalledAt = new Map<string, number | null>();
  toRead.forEach((d, i) => {
    const q = ages[i];
    signalledAt.set(d.ipfsHash, q.status === 'success' ? latestSignalChange(q.data.signals) : null);
  });
  const agesPending = ages.some((q) => q.status === 'pending');
  const agesFailed = ages.filter((q) => q.status === 'error').length;

  const rows = sortBySignalAge((directory.data ?? []).map((d) => migrationRow(d, signalledAt.get(d.ipfsHash) ?? null)));
  const unread = Math.max(0, (directory.data?.length ?? 0) - SIGNAL_AGE_ROWS);
  const perNetwork = networks.map((n) => ({ network: n, count: rows.filter((r) => r.network === n).length }));
  const started = migrationStarted();

  const directoryHref = (network: string) => `/subgraphs?${directoryParams(migrationState(network)).toString()}`;
  const thBase = 'px-4 py-3 text-[11px] font-medium text-[var(--text-muted)] select-none';

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-mono uppercase tracking-wide text-[var(--text-faint)]">Studio migration</p>
        <h1 className="text-2xl font-semibold text-[var(--text)] mt-1">Signalled, and nobody indexing</h1>
        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl leading-relaxed">
          The Graph Foundation {started ? 'began moving' : 'moves'} Subgraph Studio query traffic for {networks.join(' and ')} onto
          the network on <span className="text-[var(--text)]">{longDate(MIGRATION_START)}</span>, and Studio stops serving those
          subgraphs on <span className="text-[var(--text)]">{longDate(STUDIO_SUPPORT_ENDS)}</span>. A bot curates on each one as it is
          published; the list of which ones is not published. This is that list, read from the chain: every deployment on these
          networks with curation signal and no open allocation. Curation from the bot is guaranteed only until {longDate(CURATION_GUARANTEED_UNTIL)}.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        {perNetwork.map((p) => (
          <Link key={p.network} href={directoryHref(p.network)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-colors">
            <Badge variant="accent">{p.network}</Badge>
            <span className="font-mono text-[var(--text)]">{directory.data ? p.count.toLocaleString() : '…'}</span>
            <span className="text-[var(--text-faint)]">unallocated</span>
          </Link>
        ))}
        <span className="text-[var(--text-faint)]">
          Other chains: <code className="font-mono">?network=arbitrum-one,mainnet</code>
        </span>
      </div>

      {directory.isLoading && <ChartSkeleton height="400px" />}

      {directory.isError && (
        <Card>
          <p className="px-4 py-8 text-sm text-[var(--text-muted)] text-center">The deployment directory could not be read.</p>
        </Card>
      )}

      {directory.data && rows.length === 0 && (
        <Card>
          <p className="px-4 py-8 text-sm text-[var(--text-faint)] text-center">
            Every signalled deployment on {networks.join(' and ')} has at least one indexer.
          </p>
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[var(--bg-elevated)] border-b border-[var(--border)]">
                <tr>
                  <th className={cn(thBase, 'text-left')}>Deployment</th>
                  <th className={cn(thBase, 'text-left')}>Network</th>
                  <th className={cn(thBase, 'text-right')}>Signal</th>
                  <th className={cn(thBase, 'text-right')} title="The latest change to any curator's signal">Signalled</th>
                  <th className={cn(thBase, 'text-right')}>Curators</th>
                  <th className={cn(thBase, 'text-right')}>Indexers</th>
                  <th className={cn(thBase, 'text-right')}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <WatchStar kind="subgraph" id={r.ipfsHash} className="-ml-1" />
                        <Link href={`/subgraphs/${r.ipfsHash}`} className="text-sm font-medium text-[var(--text)] hover:text-[var(--accent-text)] hover:underline">
                          {r.displayName || truncatedQm(r.ipfsHash)}
                        </Link>
                      </div>
                      <CopyableId value={r.ipfsHash} title="Copy hash" display={truncatedQm(r.ipfsHash)} className="text-xs text-[var(--text-faint)]" />
                    </td>
                    <td className="px-4 py-3"><Badge variant="accent">{r.network}</Badge></td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-[var(--text)]">
                      {formatGRT(r.signalGrt)}
                      {r.belowReoFloor && (
                        <span className="block text-[10px] text-[var(--text-faint)]" title={`Under the ${REO_SIGNAL_FLOOR_GRT} GRT floor a subgraph needs to count for REO`}>
                          below REO floor
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">
                      {r.signalledAt !== null ? signalAgeLabel(r.signalledAt) : signalledAt.has(r.ipfsHash) && agesPending ? '…' : '--'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-muted)]">{r.curatorCount}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--red-text)]">0</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-[var(--text-faint)]">
                      {new Date(r.createdAt * 1000).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {directory.data && (
        <p className="text-[11px] text-[var(--text-faint)] leading-relaxed max-w-3xl">
          Signal and allocations are the directory&apos;s reading of the network subgraph. &ldquo;Signalled&rdquo; is the latest change to any
          curator&apos;s position, read per deployment{unread > 0 ? ` for the ${SIGNAL_AGE_ROWS} largest by signal; ${unread.toLocaleString()} smaller rows show --` : ''}
          {agesFailed > 0 ? `; ${agesFailed} of those reads failed` : ''}. Whether a deployment that gets an indexer then syncs is
          the indexer&apos;s page to answer, not this one.
        </p>
      )}
    </div>
  );
}
