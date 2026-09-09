'use client';

/**
 * The backend migration, on the front page.
 *
 * Reads the same inventory `src/proxy.ts` routes from, so the number here and the routing decision
 * cannot disagree. `buildInventory` is a pure function over a committed route list, which is why a
 * client component can compute it: no filesystem, no fetch, nothing to be unavailable.
 *
 * The summary card only. The full breakdown, route by route, is at `/migration`.
 */

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from './Card';
import { ProgressBar } from './ProgressBar';
import { buildInventory, summarise } from '@/lib/migration';
import { ROUTE_FILES } from '@/lib/route-files.generated';

export function BackendMigration() {
  const inventory = buildInventory(ROUTE_FILES);
  const s = summarise(inventory);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Backend Migration</CardTitle>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Lodestar&apos;s API moving from Next.js to kittiwake, a single Rust process
            </p>
          </div>
          <Link
            href="/migration"
            className="text-xs text-[var(--accent-text)] hover:underline shrink-0"
          >
            Route by route →
          </Link>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-end gap-4 mb-1">
          <p className="text-[32px] leading-none font-mono font-semibold text-[var(--accent-text)] tabular-nums">
            {s.percent}%
          </p>
          <p className="text-sm text-[var(--text-muted)] pb-0.5">
            <span className="font-mono text-[var(--text)]">{s.onKittiwake}</span> of{' '}
            <span className="font-mono text-[var(--text)]">{s.inScope}</span> routes served by the
            Rust backend
          </p>
        </div>

        <div className="mt-3">
          <ProgressBar value={s.onKittiwake} max={s.inScope} size="lg" />
        </div>

        {/* Six blocks, so three columns rather than four: 3+3 rather than a ragged 4+2. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 mt-5">
          {s.byWorkstream.map((w) => (
            <div key={w.workstream}>
              <p className="font-mono text-lg font-semibold text-[var(--text)] tabular-nums">
                {w.onKittiwake}
                <span className="text-[var(--text-faint)] text-sm">/{w.total}</span>
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5 capitalize">
                {w.workstream}
              </p>
              <div className="mt-1.5">
                {/* Grey where nothing has moved yet: those blocks are queued rather than failing,
                    and amber would read as an alarm about work nobody has started. */}
                <ProgressBar
                  value={w.onKittiwake}
                  max={w.total}
                  size="sm"
                  variant={w.onKittiwake === 0 ? 'neutral' : 'accent'}
                />
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-[var(--text-faint)] mt-5 leading-relaxed">
          The two run side by side on one domain: the edge forwards what kittiwake serves and leaves
          the rest on Next, so there is no flag day. The denominator counts routes meant to move and
          excludes {s.doomed} agreed for deletion, {s.stayingOnNext} staying on Next by decision and{' '}
          {s.scheduled} scheduled jobs, each listed on the{' '}
          <Link href="/migration" className="text-[var(--accent-text)] hover:underline">
            detail page
          </Link>{' '}
          rather than quietly improving the figure.
        </p>
      </CardContent>
    </Card>
  );
}
