'use client';

import { Card, CardHeader, CardTitle, CardContent } from './Card';
import { Badge } from './Badge';
import { resolveServiceName } from './ProvisionsPanel';
import { formatGRT, shortenAddress, weiToGRT, cn } from '@/lib/utils';
import type { QueryState } from '@/hooks/useQueryState';
import { unavailableReason } from '@/hooks/useQueryState';
import type {
  ProvisionActivityEvent,
  ProvisionDetailResponse,
  ProvisionDetailService,
  ThawRequest,
} from '@/lib/queries';
import {
  ACTIVITY_LABEL,
  PAYMENT_TYPES,
  paymentTypeLabel,
  periodLabel,
  ppmLabel,
  rangeLabel,
  thawListDisagrees,
  thawState,
} from '@/lib/provision-detail';

const UNAVAILABLE = 'unavailable';

function Value({ value, className }: { value: string | null; className?: string }) {
  return value === null ? (
    <span className="text-[var(--text-faint)] italic">{UNAVAILABLE}</span>
  ) : (
    <span className={cn('font-mono text-[var(--text)]', className)}>{value}</span>
  );
}

function grt(wei: string | null): string | null {
  return wei === null ? null : `${formatGRT(weiToGRT(wei))} GRT`;
}

function date(sec: number | null): string | null {
  return sec === null ? null : new Date(sec * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function TxLink({ hash }: { hash: string | null }) {
  if (!hash?.startsWith('0x') || hash.length !== 66) return null;
  return (
    <a
      href={`https://arbiscan.io/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--text-faint)] hover:text-[var(--accent-text)] transition-colors"
      title="View on Arbiscan"
    >
      ↗
    </a>
  );
}

export function ProvisionDetail({ state, nowSec }: { state: QueryState<ProvisionDetailResponse>; nowSec: number }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thaw Requests &amp; Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded-lg bg-[var(--bg-elevated)]" />
        </CardContent>
      </Card>
    );
  }
  if (state.kind !== 'ready') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Thaw Requests &amp; Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)]">
            Thaw requests, fee cuts and parameter ranges could not be loaded. Nothing here is a statement
            that this indexer has none.
          </p>
          <p className="text-xs text-[var(--text-faint)] mt-1">{unavailableReason(state)}</p>
        </CardContent>
      </Card>
    );
  }

  const { chain, services, activity } = state.data;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Thaw Requests &amp; Parameters</CardTitle>
            <span className="text-[11px] text-[var(--text-faint)]">
              {chain ? `contract reads at block ${chain.block.toLocaleString()}` : 'contract reads unavailable'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {!chain && (
            <p className="text-xs text-[var(--amber)] mb-4">
              HorizonStaking could not be read, so fee cuts, service ranges and what each request is worth
              are shown as unavailable. The requests themselves come from the index.
            </p>
          )}
          {services.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-6">No provisions to show.</p>
          ) : (
            <div className="space-y-5">
              {services.map((s) => (
                <ServiceDetail key={s.dataService} service={s} nowSec={nowSec} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ActivityCard activity={activity} />
    </div>
  );
}

function ServiceDetail({ service: s, nowSec }: { service: ProvisionDetailService; nowSec: number }) {
  const pendingCut = s.maxVerifierCutPending !== null && String(s.maxVerifierCutPending) !== s.maxVerifierCut
    ? ppmLabel(s.maxVerifierCutPending)
    : null;
  const pendingPeriod = s.thawingPeriodPending !== null && s.thawingPeriodPending !== s.thawingPeriod
    ? periodLabel(s.thawingPeriodPending)
    : null;
  const disagrees = thawListDisagrees(s.thawRequestCount, s.thawRequests.length);

  return (
    <div className="p-4 rounded-lg border border-[var(--border)]">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h4 className="font-semibold text-[var(--text)]">{resolveServiceName(s.dataService)}</h4>
        <span className="text-xs font-mono text-[var(--text-faint)]">{shortenAddress(s.dataService)}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-sm">
        <div className="p-3 rounded bg-[var(--bg-elevated)]">
          <p className="text-xs text-[var(--text-faint)] mb-1">Max verifier cut</p>
          <Value value={ppmLabel(s.maxVerifierCut)} />
          {pendingCut && <span className="text-xs text-[var(--amber)] ml-2">{pendingCut} staged</span>}
          <p className="text-xs text-[var(--text-faint)] mt-1">
            service accepts <Value value={rangeLabel(s.verifierCutRange, ppmLabel)} className="text-xs" />
          </p>
        </div>
        <div className="p-3 rounded bg-[var(--bg-elevated)]">
          <p className="text-xs text-[var(--text-faint)] mb-1">Thawing period</p>
          <Value value={periodLabel(s.thawingPeriod)} />
          {pendingPeriod && <span className="text-xs text-[var(--amber)] ml-2">{pendingPeriod} staged</span>}
          <p className="text-xs text-[var(--text-faint)] mt-1">
            service accepts <Value value={rangeLabel(s.thawingPeriodRange, periodLabel)} className="text-xs" />
          </p>
        </div>
      </div>

      <p className="text-xs text-[var(--text-faint)] mb-1.5">Delegation fee cut: the share of each payment paid to delegators</p>
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        {PAYMENT_TYPES.map((p) => (
          <div key={p.key} className="p-2 rounded bg-[var(--bg-elevated)]">
            <p className="text-[11px] text-[var(--text-faint)]">{p.label}</p>
            <Value value={ppmLabel(s.delegationFeeCuts[p.key])} className="text-sm" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-[var(--text-faint)]">Thaw requests</p>
        {s.thawRequests.length > 0 && <Badge variant="warning">{s.thawRequests.length} pending</Badge>}
      </div>
      {disagrees && (
        <p className="text-xs text-[var(--amber)] mb-2">
          HorizonStaking lists {s.thawRequestCount} pending; the index shows {s.thawRequests.length}. The index may be behind.
        </p>
      )}
      {s.thawRequests.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">None pending.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--text-faint)] text-left">
                <th className="font-normal py-1 pr-3">Amount</th>
                <th className="font-normal py-1 pr-3">Unlocks</th>
                <th className="font-normal py-1 pr-3">Status</th>
                <th className="font-normal py-1" />
              </tr>
            </thead>
            <tbody>
              {s.thawRequests.map((r) => (
                <ThawRow key={r.id} req={r} nowSec={nowSec} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ThawRow({ req, nowSec }: { req: ThawRequest; nowSec: number }) {
  const st = thawState(req, nowSec);
  const status =
    st.kind === 'invalidated' ? (
      <span className="text-[var(--red-text)]">Invalidated by a slash</span>
    ) : st.kind === 'ready' ? (
      <span className="text-[var(--green)]">Ready to deprovision</span>
    ) : st.kind === 'thawing' ? (
      <span className="text-[var(--amber)]">{periodLabel(st.secondsLeft)} left</span>
    ) : (
      <span className="text-[var(--text-faint)] italic">{UNAVAILABLE}</span>
    );
  return (
    <tr className="border-t border-[var(--border)]">
      <td className="py-1.5 pr-3"><Value value={grt(req.tokens)} /></td>
      <td className="py-1.5 pr-3"><Value value={date(req.thawingUntil)} /></td>
      <td className="py-1.5 pr-3 text-xs">{status}</td>
      <td className="py-1.5 text-right"><TxLink hash={req.txHash} /></td>
    </tr>
  );
}

function activityDetail(e: ProvisionActivityEvent): string | null {
  switch (e.kind) {
    case 'DelegationFeeCutSet':
      return `${paymentTypeLabel(e.paymentType)} to ${ppmLabel(e.feeCut) ?? UNAVAILABLE}`;
    case 'ThawRequestCreated':
      return e.thawingUntil === null ? null : `unlocks ${date(e.thawingUntil)}`;
    case 'ThawRequestFulfilled':
      return e.valid === false ? 'invalidated, released nothing' : grt(e.tokens);
    case 'ProvisionIncreased':
      return e.events > 1 ? `${grt(e.tokens)} in ${e.events} increases` : grt(e.tokens);
    default:
      return grt(e.tokens);
  }
}

function ActivityCard({ activity }: { activity: ProvisionActivityEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Horizon Activity</CardTitle>
        <p className="text-[11px] text-[var(--text-faint)] mt-1">This indexer&apos;s provisions, thaw requests, slashes and fee cuts</p>
      </CardHeader>
      <CardContent>
        {activity.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-6">No Horizon provision events for this indexer.</p>
        ) : (
          <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {activity.map((e, i) => (
              <div
                key={`${e.txHash}-${e.kind}-${i}`}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs',
                  'bg-[var(--bg-elevated)] border-[0.5px] border-[var(--border)]',
                  e.kind === 'ProvisionSlashed' && 'border-[var(--red-dim)]',
                )}
              >
                <span className={cn(
                  'text-[9px] font-bold uppercase tracking-wider shrink-0 min-w-[84px]',
                  e.kind === 'ProvisionSlashed' ? 'text-[var(--red-text)]' : 'text-[var(--text-muted)]',
                )}>
                  {ACTIVITY_LABEL[e.kind] ?? e.kind}
                </span>
                <span className="text-[var(--text-faint)] shrink-0 hidden sm:inline">
                  {e.dataService ? resolveServiceName(e.dataService) : ''}
                </span>
                <span className="font-mono text-[var(--text)] truncate">{activityDetail(e) ?? ''}</span>
                <span className="ml-auto text-[10px] text-[var(--text-faint)] shrink-0 flex items-center gap-1.5">
                  {date(e.timestamp)}
                  <TxLink hash={e.txHash} />
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
