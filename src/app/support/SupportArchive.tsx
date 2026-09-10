'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';
import { useGraphSupport } from '@/hooks/useGraphSupport';
import {
  areaCounts,
  areasOf,
  dispositionLabel,
  filterIssues,
  groupByArea,
  ownerLabel,
  primaryDisposition,
  primaryOwner,
  type IssueGroup,
  type SupportIssue,
} from '@/lib/graph-support';
import { cn } from '@/lib/utils';

const DISCORD_URL = 'https://discord.gg/CQewvyJ69Y';

type Tab = 'open' | 'resolved';

const EMPTY: SupportIssue[] = [];

function relativeDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? 'a month ago' : `${months} months ago`;
}

/** A disposition's badge colour: repaired reads differently from merely diagnosed. */
function dispositionVariant(key: string): 'success' | 'warning' | 'default' {
  if (key === 'fixed') return 'success';
  if (key === 'handed-off') return 'warning';
  return 'default';
}

function IssueRow({ issue, area }: { issue: SupportIssue; area: string }) {
  const owner = primaryOwner(issue);
  const disposition = primaryDisposition(issue);
  // The heading already says this area, so only the ones it also spans are worth the space, and
  // as plain text rather than badges: the badges carry the judgements, not the filing.
  const alsoIn = areasOf(issue).filter((a) => a !== area);

  return (
    <Link
      href={`/support/${issue.number}`}
      className="group flex flex-col gap-2 border-t border-[var(--border)] py-3 first:border-t-0 sm:flex-row sm:items-baseline sm:gap-4"
    >
      <span className="shrink-0 font-mono text-xs text-[var(--text-faint)] sm:w-12 sm:text-right">
        #{issue.number}
      </span>

      <span className="min-w-0 flex-1">
        {/* Titles carry the literal error text and run to 229 characters at the longest, so they
            clamp rather than pushing the badges and dates off the row. */}
        <span className="block break-words text-sm leading-snug text-[var(--text)] transition-colors group-hover:text-[var(--accent-text)] line-clamp-3">
          {issue.title}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-faint)]">
          {owner && <Badge variant="accent">{ownerLabel(owner)}</Badge>}
          {issue.state === 'closed' && disposition && (
            <Badge variant={dispositionVariant(disposition)}>{dispositionLabel(disposition)}</Badge>
          )}
          {alsoIn.length > 0 && <span>also {alsoIn.join(', ')}</span>}
          <span>updated {relativeDate(issue.updatedAt)}</span>
          {issue.comments > 0 && (
            <span>
              {issue.comments} {issue.comments === 1 ? 'reply' : 'replies'}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

function GroupSection({ group }: { group: IssueGroup }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--text)]">{group.label}</h3>
        <span className="font-mono text-xs text-[var(--text-faint)]">{group.issues.length}</span>
      </div>
      {group.blurb && (
        <p className="mb-2 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
          {group.blurb}
        </p>
      )}
      <div className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-4">
        {group.issues.map((issue) => (
          <IssueRow key={issue.number} issue={issue} area={group.key} />
        ))}
      </div>
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)]"
        />
      ))}
    </div>
  );
}

export default function SupportArchive() {
  const { data, isLoading, error } = useGraphSupport();
  const [tab, setTab] = useState<Tab>('open');
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<string | null>(null);

  // A fresh `?? []` on every render would defeat every useMemo below it.
  const issues = useMemo(() => data?.issues ?? EMPTY, [data]);

  const visible = useMemo(() => {
    const searched = filterIssues(issues, query);
    return area === null ? searched : searched.filter((i) => areasOf(i).includes(area));
  }, [issues, query, area]);

  const areas = useMemo(() => areaCounts(issues), [issues]);
  const openCount = issues.filter((i) => i.state === 'open').length;
  const closedCount = issues.length - openCount;

  const onTab = useMemo(
    () => visible.filter((i) => (tab === 'open' ? i.state === 'open' : i.state === 'closed')),
    [visible, tab],
  );
  const groups = useMemo(() => groupByArea(onTab), [onTab]);

  // Nineteen of the thirty-three sit in more than one area and are listed under each, so the
  // headings deliberately add up to more than this. Count the issues, not the rows.
  const shown = onTab.length;
  const listed = groups.reduce((n, g) => n + g.issues.length, 0);
  const filtering = query.trim() !== '' || area !== null;

  // A search that matches only on the other tab would otherwise render as "nothing matches",
  // which is the page telling a reader their error is not in an archive that in fact holds it.
  const otherTab: Tab = tab === 'open' ? 'resolved' : 'open';
  const elsewhere = visible.filter((i) =>
    otherTab === 'open' ? i.state === 'open' : i.state === 'closed',
  ).length;

  if (error) {
    return (
      <SourceUnavailable
        what="The graph-support archive"
        detail={
          error instanceof Error
            ? `${error.message}. Nothing is listed below rather than an empty archive being shown as though the repository were empty.`
            : undefined
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border-[0.5px] border-[var(--border)] p-0.5">
          {(
            [
              ['open', 'Open', openCount],
              ['resolved', 'Resolved', closedCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                tab === key
                  ? 'bg-[var(--accent-dim)] text-[var(--accent-text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {label}
              {!isLoading && <span className="ml-1.5 font-mono opacity-60">{count}</span>}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, or paste the error"
          aria-label="Search graph-support issue titles"
          className="min-w-0 flex-1 rounded-full border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:border-[var(--border-mid)] focus:outline-none sm:max-w-xs"
        />
      </div>

      {areas.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setArea(null)}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] transition-colors',
              area === null
                ? 'bg-[var(--accent-dim)] text-[var(--accent-text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            all areas
          </button>
          {areas.map(({ area: name, count }) => (
            <button
              key={name}
              type="button"
              onClick={() => setArea(area === name ? null : name)}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] transition-colors',
                area === name
                  ? 'bg-[var(--accent-dim)] text-[var(--accent-text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )}
            >
              {name}
              <span className="ml-1 font-mono opacity-50">{count}</span>
            </button>
          ))}
        </div>
      )}

      <p className="mb-5 max-w-2xl text-xs leading-relaxed text-[var(--text-muted)]">
        Grouped by the part of the stack it is about, following the path a subgraph takes: publish,
        index, serve, route, and the chain underneath.{' '}
        {listed > shown && (
          <>
            {shown} issues across {groups.length} areas, listed under each area they touch.{' '}
          </>
        )}
        Each row says who can actually fix it.
      </p>

      {isLoading ? (
        <SkeletonRows />
      ) : shown === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          {filtering
            ? `Nothing ${tab === 'open' ? 'open' : 'resolved'} matches that.`
            : tab === 'open'
              ? 'No open issues.'
              : 'No resolved issues yet.'}{' '}
          {filtering && elsewhere > 0 && (
            <>
              {elsewhere} {otherTab === 'open' ? 'open' : 'resolved'}{' '}
              {elsewhere === 1 ? 'issue does' : 'issues do'}.{' '}
              <button
                type="button"
                onClick={() => setTab(otherTab)}
                className="text-[var(--accent-text)] hover:underline"
              >
                Show {otherTab === 'open' ? 'open' : 'resolved'}
              </button>
              .{' '}
            </>
          )}
          <Link
            href={`/support/new${query.trim() ? `?title=${encodeURIComponent(query.trim())}` : ''}`}
            className="text-[var(--accent-text)] hover:underline"
          >
            File a new one
          </Link>{' '}
          or ask in{' '}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            the Discord
          </a>
          .
        </p>
      ) : (
        groups.map((group) => <GroupSection key={group.key || 'unlabelled'} group={group} />)
      )}
    </div>
  );
}
