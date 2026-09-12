'use client';

import { useQuery } from '@tanstack/react-query';

import { isUnavailable, unavailableReason, useQueryState } from '@/hooks/useQueryState';
import { fetchServiceCensus } from '@/lib/api';
import type { ProbeVerdict, VerdictLabels } from '@/lib/service-census';

/**
 * Registry versus reality for Dispatch.
 *
 * The catalogue entry beside this is hand-written and therefore goes stale — it claimed
 * "Live · Production" for 39 days after every endpoint stopped answering. This reports what the
 * registry's advertised endpoints actually did when something last called them, so the page cannot
 * confidently lie again.
 *
 * It reads `/api/service-census`, kittiwake's probe, rather than `/api/provider-liveness`, which
 * was this repo's own and said the same thing about one service where the census says it about
 * five. Two probes of the same registry can disagree, and the one that is wrong is whichever a
 * reader is not looking at.
 */

/**
 * What counts as alive, matching `census.rs` rather than guessing.
 *
 * A 402 is a service that answered and wants paying, which is a different thing from a dead host
 * and the distinction is the whole point of this panel.
 */
const ALIVE = new Set<ProbeVerdict>(['serving', 'paywalled']);

const VERDICT_LABEL: VerdictLabels = {
  serving: 'serving',
  paywalled: 'paywalled',
  http_error: 'HTTP error',
  refused: 'refused',
  no_endpoint: 'no endpoint',
  unreachable: 'unreachable',
  timeout: 'timeout',
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function RegistryVsReality() {
  const query = useQueryState(
    useQuery({
      queryKey: ['service-census'],
      queryFn: fetchServiceCensus,
      refetchInterval: 300_000,
      staleTime: 240_000,
      retry: 1,
    }),
  );

  const heading = (
    <h4 className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-wide mb-2.5">
      Registry vs reality
    </h4>
  );

  // A probe that could not run must never render as "all healthy".
  if (isUnavailable(query)) {
    return (
      <div>
        {heading}
        <p className="text-[11px] text-[var(--amber)]">
          {unavailableReason(query)} This is not evidence that anything is healthy.
        </p>
      </div>
    );
  }

  if (query.kind !== 'ready') {
    return (
      <div>
        {heading}
        <p className="text-xs text-[var(--text-faint)]">probing advertised endpoints…</p>
      </div>
    );
  }

  const service = query.data.services.find((s) => s.id === 'dispatch');
  if (!service) {
    return (
      <div>
        {heading}
        <p className="text-[11px] text-[var(--amber)]">
          The census no longer carries Dispatch, so this panel has nothing to report on.
        </p>
      </div>
    );
  }

  const { registered, serving, lying, providers } = service;
  const allDown = registered > 0 && serving === 0;
  const partial = serving > 0 && serving < registered;

  return (
    <div>
      {heading}

      <p
        className={`font-mono text-[13px] font-semibold tabular-nums ${
          allDown ? 'text-[var(--red-text)]' : partial ? 'text-[var(--amber)]' : 'text-[var(--green)]'
        }`}
      >
        {serving}/{registered} answering
      </p>
      <p className="text-[11px] text-[var(--text-faint)] mb-2.5">
        registered on-chain vs endpoints that answered when last called
      </p>

      <div className="space-y-2">
        {providers.map((p) => {
          const alive = ALIVE.has(p.verdict);
          return (
            <div key={`${p.address}:${p.endpoint ?? 'none'}`} className="text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    alive ? 'bg-[var(--green)]' : 'bg-[var(--red-text)]'
                  }`}
                />
                <span className="font-mono text-[10px] text-[var(--text-muted)]">
                  {shortAddr(p.address)}
                </span>
              </div>
              <div className="pl-3 text-[10px] text-[var(--text-faint)] truncate">
                {p.endpoint ? (
                  <span className="font-mono">{p.endpoint.replace(/^https?:\/\//, '')}</span>
                ) : (
                  <span>no endpoint advertised</span>
                )}
                {' · '}
                <span className={alive ? 'text-[var(--green)]' : 'text-[var(--amber)]'}>
                  {VERDICT_LABEL[p.verdict]}
                </span>
                {alive && p.latencyMs !== null ? ` ${p.latencyMs}ms` : ''}
              </div>
            </div>
          );
        })}
      </div>

      {lying > 0 && (
        <p className="text-[11px] text-[var(--amber)] mt-2.5">
          {lying === 1
            ? 'One provider is registered on-chain while advertising an endpoint that does not answer.'
            : `${lying} providers are registered on-chain while advertising endpoints that do not answer.`}{' '}
          Consumers following the registry will fail.
        </p>
      )}
    </div>
  );
}
