'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ChartSkeleton } from '@/components/ui/ChartSkeleton';
import { CopyButton } from '@/components/ui/CopyButton';
import { SourceUnavailable } from '@/components/ui/SourceUnavailable';
import { useQueryState, unavailableReason } from '@/hooks/useQueryState';
import { fetchApiDoc } from '@/lib/api';
import { filterRoutes, type ApiRoute } from '@/lib/openapi';
import { cn } from '@/lib/utils';

const PUBLIC_ORIGIN = 'https://api.lodestar-dashboard.com';
const DOC_URL = `${PUBLIC_ORIGIN}/openapi.json`;

// kittiwake's defaults in deploy/install.sh, per calling address.
const RATE_LIMITS = [
  { tier: 'Reads', limit: '120 a minute', covers: 'Every route not named in the two rows below.' },
  { tier: 'SQL', limit: '10 a minute', covers: 'Running a query on the SQL surface, named or free-form, and issuing a receipt.' },
  {
    tier: 'Outbound',
    limit: '30 a minute',
    covers: "Routes that call somebody else's infrastructure: the indexer node health check, presenting a POI and a data-service sample query.",
  },
];

function RouteRow({ route, origin }: { route: ApiRoute; origin: string }) {
  const pathParams = route.params.filter((p) => p.in === 'path');
  const queryParams = route.params.filter((p) => p.in === 'query');
  return (
    <li className="py-3">
      <div className="flex items-start gap-2 min-w-0">
        <Badge variant="accent" className="shrink-0">{route.method}</Badge>
        <code className="font-mono text-sm text-[var(--text)] break-all">{route.path}</code>
        <CopyButton text={`${origin}${route.path}`} variant="icon" title="Copy URL" className="shrink-0 mt-0.5" />
      </div>
      {route.summary ? <p className="mt-1 text-sm text-[var(--text-muted)]">{route.summary}</p> : null}
      {pathParams.length || queryParams.length ? (
        <p className="mt-1 text-xs text-[var(--text-faint)]">
          {[...pathParams, ...queryParams].map((p, i) => (
            <span key={`${p.in}:${p.name}`}>
              {i > 0 ? ', ' : ''}
              <code className="font-mono text-[var(--text-muted)]">{p.name}</code>
              {' '}({p.in}{p.required ? ', required' : ''})
            </span>
          ))}
        </p>
      ) : null}
    </li>
  );
}

export default function ApiReference() {
  const query = useQuery({ queryKey: ['openapi'], queryFn: fetchApiDoc, staleTime: 10 * 60 * 1000 });
  const state = useQueryState(query);
  const [search, setSearch] = useState('');

  const doc = state.kind === 'ready' ? state.data : null;
  const origin = doc?.server ?? PUBLIC_ORIGIN;
  const routes = doc ? filterRoutes(doc.routes, search) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">API</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl">
          Everything on Lodestar is read from one public API at{' '}
          <code className="font-mono text-[var(--text)]">{PUBLIC_ORIGIN}</code>. No key is needed. The
          routes below come live from its{' '}
          <a href={DOC_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] hover:underline">
            OpenAPI document
          </a>
          , which is generated from the server&rsquo;s own router, so it cannot list a route that does not
          exist. Every answer carries a provenance envelope naming the block it was sealed through.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Rate limits</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Budgets are per calling address and counted by the one server, not per edge. Past one, a
            request is answered <code className="font-mono">429</code> with a{' '}
            <code className="font-mono">Retry-After</code> header in seconds. Answers are cached for a few
            minutes, so asking again sooner returns the same thing.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium text-[var(--text-muted)]">
                  <th scope="col" className="py-2 pr-4">Tier</th>
                  <th scope="col" className="py-2 pr-4">Budget</th>
                  <th scope="col" className="py-2">Covers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {RATE_LIMITS.map((r) => (
                  <tr key={r.tier}>
                    <td className="py-2 pr-4 text-[var(--text)]">{r.tier}</td>
                    <td className="py-2 pr-4 font-mono text-[var(--text)] whitespace-nowrap">{r.limit}</td>
                    <td className="py-2 text-[var(--text-muted)]">{r.covers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {state.kind === 'loading' || state.kind === 'idle' ? (
        <ChartSkeleton height="1200px" />
      ) : state.kind !== 'ready' ? (
        <SourceUnavailable what="The API description" detail={unavailableReason(state)} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>
                  Routes <span className="font-mono text-[var(--text-faint)] text-xs">{doc!.routes.length}</span>
                </CardTitle>
                <input
                  type="text"
                  aria-label="Filter routes"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by path or description"
                  className={cn(
                    'w-full sm:w-72 px-3 py-1.5 text-sm rounded-[var(--radius-button)]',
                    'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                    'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                  )}
                />
              </div>
            </CardHeader>
            <CardContent>
              {routes.length ? (
                <ul className="divide-y divide-[var(--border)]">
                  {routes.map((r) => (
                    <RouteRow key={`${r.method} ${r.path}`} route={r} origin={origin} />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-[var(--text-faint)]">No route matches that.</p>
              )}
            </CardContent>
          </Card>

          {doc!.internal.length ? (
            <Card>
              <CardHeader>
                <CardTitle>
                  Internal <span className="font-mono text-[var(--text-faint)] text-xs">{doc!.internal.length}</span>
                </CardTitle>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Served, but not part of the public API. They may change or require a session without
                  notice, so do not build on them.
                </p>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-[var(--border)]">
                  {doc!.internal.map((w) => (
                    <li key={w.path} className="py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="warning">internal</Badge>
                        <code className="font-mono text-sm text-[var(--text)] break-all">{w.path}</code>
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">{w.reason}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
