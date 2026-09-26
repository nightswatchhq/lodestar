'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { CopyableId, truncatedQm } from '@/components/ui/CopyableId';
import { WatchStar } from '@/components/ui/WatchStar';
import { fetchSubgraphCuration, fetchSubgraphDirectory, type DirectoryRow } from '@/lib/api';
import { directoryApiQuery, directoryParams, emptyDirectoryState, fetchWholeDirectory } from '@/lib/subgraph-directory';
import {
  CURATION_GUARANTEED_UNTIL,
  MIGRATION_START,
  REO_SIGNAL_FLOOR_GRT,
  SIGNAL_AGE_ROWS,
  STUDIO_SUPPORT_ENDS,
  filterMigrationRows,
  migrationParams,
  parseMigrationFilters,
  toggleNetwork,
  type MigrationFilters,
  migrationRow,
  migrationStarted,
  migrationState,
    readSignalAges,
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

/** Chips shown before the rest fold into a select. */
const NETWORK_CHIPS = 8;

function StudioMigration() {
  const router = useRouter();
  const filters = parseMigrationFilters(useSearchParams());
  const { networks } = filters;
  const [search, setSearch] = useState(filters.q);
  const setFilters = (f: MigrationFilters) => {
    const qs = migrationParams(f).toString();
    router.replace(qs ? `/subgraphs/migration?${qs}` : '/subgraphs/migration', { scroll: false });
  };

  // Every network the directory knows, most deployments first. Its counts are over all deployments,
  // not the unallocated ones, so they order the chips and are never shown on them.
  const known = useQuery({
    queryKey: ['subgraphDirectoryNetworks'],
    queryFn: async () => (await fetchSubgraphDirectory(directoryApiQuery(emptyDirectoryState(), 1))).facets.networks.map((f) => f.id),
    staleTime: FIVE_MINUTES * 12,
  });
  const chipNetworks = [...new Set([...networks, ...(known.data ?? []).slice(0, NETWORK_CHIPS)])];
  const moreNetworks = (known.data ?? []).filter((n) => !chipNetworks.includes(n));

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
  const reading = useMemo(() => toRead.map((d) => d.ipfsHash), [toRead]);
  const ages = useQuery({
    queryKey: ['studioMigrationAges', reading],
    queryFn: () => readSignalAges(reading, fetchSubgraphCuration),
    enabled: reading.length > 0,
    staleTime: FIVE_MINUTES,
  });
  const signalledAt = ages.data?.at ?? new Map<string, number | null>();
  const agesPending = reading.length > 0 && ages.isPending;
  const agesFailed = ages.data?.failed ?? 0;

  const rows = sortBySignalAge((directory.data ?? []).map((d) => migrationRow(d, signalledAt.get(d.ipfsHash) ?? null)));
  const unread = Math.max(0, (directory.data?.length ?? 0) - SIGNAL_AGE_ROWS);
  const shown = filterMigrationRows(rows, filters);
  const countFor = (n: string) => rows.filter((r) => r.network === n).length;
  const started = migrationStarted();

  const directoryHref = (network: string) => `/subgraphs?${directoryParams(migrationState(network)).toString()}`;
  const thBase = 'px-4 py-3 text-[11px] font-medium text-[var(--text-muted)] select-none';
  const buttonBase = 'px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] border transition-colors';
  const buttonOn = 'bg-[var(--accent)] text-white border-[var(--accent)]';
  const buttonOff = 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)] hover:border-[var(--accent)]';

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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Networks">
          {chipNetworks.map((n) => {
            const on = networks.includes(n);
            return (
              <button
                key={n}
                aria-pressed={on}
                onClick={() => setFilters({ ...filters, networks: toggleNetwork(networks, n) })}
                className={cn(buttonBase, 'inline-flex items-center gap-2', on ? buttonOn : buttonOff)}
              >
                {n}
                {on && <span className="font-mono opacity-80">{directory.data ? countFor(n).toLocaleString() : '…'}</span>}
              </button>
            );
          })}
          {moreNetworks.length > 0 && (
            <select
              aria-label="Add a network"
              value=""
              onChange={(e) => e.target.value && setFilters({ ...filters, networks: toggleNetwork(networks, e.target.value) })}
              className="px-3 py-1.5 text-xs rounded-[var(--radius-button)] bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">More networks…</option>
              {moreNetworks.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            aria-pressed={filters.floorOnly}
            title={`Only deployments carrying at least ${REO_SIGNAL_FLOOR_GRT} GRT, the signal a subgraph needs to count towards REO`}
            onClick={() => setFilters({ ...filters, floorOnly: !filters.floorOnly })}
            className={cn(buttonBase, filters.floorOnly ? buttonOn : buttonOff)}
          >
            {REO_SIGNAL_FLOOR_GRT}+ GRT only
          </button>
          <input
            type="search"
            aria-label="Search by name or hash"
            placeholder="Name or Qm hash"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFilters({ ...filters, q: e.target.value.trim() });
            }}
            className="px-3 py-1.5 w-56 text-xs rounded-[var(--radius-button)] bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]"
          />
          {directory.data && (
            <span className="text-[var(--text-faint)]">
              {shown.length === rows.length
                ? `${rows.length.toLocaleString()} unallocated`
                : `${shown.length.toLocaleString()} of ${rows.length.toLocaleString()} unallocated`}
              {networks.length === 1 && (
                <>
                  {' · '}
                  <Link href={directoryHref(networks[0])} className="hover:text-[var(--accent-text)] hover:underline">
                    open in the directory
                  </Link>
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {directory.isLoading && <ChartSkeleton height="400px" />}

      {directory.isError && (
        <Card>
          <p className="px-4 py-8 text-sm text-[var(--text-muted)] text-center">The deployment directory could not be read.</p>
        </Card>
      )}

      {directory.data && shown.length === 0 && (
        <Card>
          <p className="px-4 py-8 text-sm text-[var(--text-faint)] text-center">
            {rows.length === 0
              ? `Every signalled deployment on ${networks.join(' and ')} has at least one indexer.`
              : 'Nothing unallocated matches these filters.'}
          </p>
        </Card>
      )}

      {shown.length > 0 && (
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
                {shown.map((r) => (
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
                      {r.signalledAt !== null ? signalAgeLabel(r.signalledAt) : agesPending && reading.includes(r.ipfsHash) ? '…' : '--'}
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
          curator&apos;s position, read per deployment{unread > 0 ? ` for the ${SIGNAL_AGE_ROWS} largest by signal` : ''}
          {agesFailed > 0 ? `, ${agesFailed} of which failed to read` : ''}{unread > 0 ? `; ${unread.toLocaleString()} smaller rows show --` : ''}. Whether a deployment that gets an indexer then syncs is
          the indexer&apos;s page to answer, not this one.
        </p>
      )}
    </div>
  );
}
