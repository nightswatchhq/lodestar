'use client';

import Link from 'next/link';
import { useIndexerQosDeployments } from '@/hooks/useNetworkStats';
import type { ActiveAllocation } from '@/lib/contracts/indexer-detail';
import {
  REO_COVERAGE_CHANGE,
  REO_SIGNAL_FLOOR_GRT,
  REO_SUBGRAPHS_FROM,
  coverage,
  coverageChanged,
} from '@/lib/reo-coverage';
import { cn, weiToGRT } from '@/lib/utils';

/** Signal now, by every id the QoS rows might name a deployment by. */
function signalByDeployment(allocations: ActiveAllocation[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of allocations) {
    const grt = weiToGRT(a.subgraphDeployment.signalledTokens);
    m.set(a.subgraphDeployment.id.toLowerCase(), grt);
    m.set(a.subgraphDeployment.ipfsHash.toLowerCase(), grt);
  }
  return m;
}

const UNALLOCATED_FLOOR_HREF = `/subgraphs?indexersMax=0&signalMin=${REO_SIGNAL_FLOOR_GRT}&sort=signal`;

/**
 * How many subgraphs over the REO floor this indexer served in the QoS window, against the five
 * a day the oracle wants from 6 October. A 30-day figure bounds every day in it from above, so
 * under five here is under five on every day.
 */
export function ReoCoverage({ indexer, allocations }: { indexer: string; allocations: ActiveAllocation[] | undefined }) {
  const query = useIndexerQosDeployments(indexer);
  const changed = coverageChanged();
  const when = new Date(`${REO_COVERAGE_CHANGE}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });

  const c = query.status === 'success' && allocations ? coverage(query.data.deployments, signalByDeployment(allocations)) : null;
  const short = c !== null && c.qualifying < REO_SUBGRAPHS_FROM;

  return (
    <div className="border-t border-[var(--border)] pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[var(--text-muted)]">
          Qualifying subgraphs served, {query.status === 'success' ? `${query.data.window_days} days` : 'window'}
        </span>
        <span className={cn('text-sm font-mono font-medium', short ? 'text-[var(--red-text)]' : 'text-[var(--text)]')}>
          {c === null ? (query.status === 'error' ? '--' : '…') : c.qualifying}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[var(--text-faint)]">Needs, on each active day, {changed ? 'since' : 'from'} {when}</span>
        <span className={cn('font-mono', short ? 'text-[var(--red-text)]' : 'text-[var(--text-muted)]')}>{REO_SUBGRAPHS_FROM}</span>
      </div>
      <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
        A qualifying subgraph carries at least {REO_SIGNAL_FLOOR_GRT} GRT of signal; the rule was 1 a day before {when}. Allocating
        is not enough: the gateway has to route the query and it has to come back 200, under 5 s, within 50,000 blocks. The
        figure above is deployments served at any point in the window that carry that signal today, so it is a ceiling on any
        one day, not a day&apos;s count. Under {REO_SUBGRAPHS_FROM} here means under {REO_SUBGRAPHS_FROM} on every day.
        {c !== null && c.unknown > 0 && ` ${c.unknown} served ${c.unknown === 1 ? 'deployment is' : 'deployments are'} not allocated now, so their signal is unread and they count for nothing here.`}
        {!changed && ' Eligibility renewed before the change keeps its 14 days.'}
      </p>
      {short && (
        <Link href={UNALLOCATED_FLOOR_HREF} className="text-[11px] text-[var(--accent-text)] hover:underline">
          Signalled deployments over the floor that nobody indexes &rarr;
        </Link>
      )}
      <p className="text-[10px] text-[var(--text-faint)] leading-relaxed">
        Rule from the Foundation&apos;s 22 September 2026 announcement. The oracle repository&apos;s ELIGIBILITY_CRITERIA.md carries
        the five-subgraph change but not the {REO_SIGNAL_FLOOR_GRT} GRT floor; if the oracle disagrees with either, this count is
        wrong the same way.
      </p>
    </div>
  );
}
