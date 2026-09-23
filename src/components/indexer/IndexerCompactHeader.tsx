'use client';

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { CopyButton } from '@/components/ui/CopyButton';
import { cn, formatGRT, formatPPM, formatPercent, formatRelativeTime, shortenAddress, weiToGRT } from '@/lib/utils';
import { plainGRT } from '@/lib/subgraph-service-stake';
import { ACCRUED_TOOLTIP, type AccruedTotal } from '@/lib/pending-rewards';

export function IndexerCompactHeader({
  name,
  address,
  reoStatus,
  availableGRT,
  provisionedGRT,
  allocatedGRT,
  delegatedGRT,
  allocationRatio,
  statedCutPPM,
  effectiveCutPercent,
  rollingAPY30d,
  accrued = { kind: 'unavailable' },
  accruedAt = null,
}: {
  name: string;
  address: string;
  reoStatus?: { status: string; daysRemaining: number | null } | null;
  availableGRT: number | null;
  provisionedGRT: number | null;
  allocatedGRT: number | null;
  delegatedGRT: number;
  allocationRatio: number | null;
  statedCutPPM: number;
  effectiveCutPercent: number | null;
  rollingAPY30d: number | null;
  accrued?: AccruedTotal;
  accruedAt?: number | null;
}) {
  const ineligible = reoStatus?.status === 'ineligible';
  const accruedTitle = [
    ACCRUED_TOOLTIP,
    accrued.kind === 'unavailable' ? 'Not available: the API sent no pending-rewards reading.' : null,
    accrued.kind === 'ready' && accrued.unread > 0
      ? `${accrued.unread} allocation${accrued.unread === 1 ? '' : 's'} could not be read and ${accrued.unread === 1 ? 'is' : 'are'} not counted.`
      : null,
    accruedAt != null ? `Read ${formatRelativeTime(accruedAt)}.` : null,
    ineligible ? 'The REO marks this indexer ineligible.' : null,
  ].filter(Boolean).join(' ');
  const cut =
    effectiveCutPercent != null
      ? `${effectiveCutPercent.toFixed(2)}% / ${formatPPM(statedCutPPM)}`
      : formatPPM(statedCutPPM);

  return (
    <header
      className={cn(
        'sticky top-[calc(var(--safe-top)+var(--topbar-height))] z-20',
        '-mx-4 md:-mx-6 px-4 md:px-6 py-3',
        'bg-[var(--bg)] border-b border-[var(--border)]',
      )}
    >
      <div className="flex items-center justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base sm:text-lg font-semibold text-[var(--text)] truncate">{name}</h1>
            {reoStatus?.status ? (
              <span className="hidden sm:inline-flex flex-shrink-0">
                <Badge
                  variant={
                    reoStatus.status === 'eligible' ? 'success'
                      : reoStatus.status === 'ineligible' ? 'error'
                      : 'default'
                  }
                  title={
                    reoStatus.status === 'unknown'
                      ? 'The on-chain REO oracle could not be reached'
                      : reoStatus.daysRemaining != null && reoStatus.daysRemaining > 0
                        ? `Next renewal in ~${reoStatus.daysRemaining.toFixed(1)} days`
                        : 'Rewards Eligibility (GIP-0079)'
                  }
                >
                  {reoStatus.status === 'eligible' ? 'Eligible'
                    : reoStatus.status === 'ineligible' ? 'Ineligible'
                    : 'Eligibility unavailable'}
                </Badge>
              </span>
            ) : null}
          </div>
          <div className="hidden sm:flex items-center gap-1.5 mt-0.5">
            <p className="text-xs text-[var(--text-faint)] font-mono">{shortenAddress(address)}</p>
            <CopyButton text={address} variant="icon" title="Copy address" />
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 flex-shrink-0">
          {availableGRT == null ? (
            <p className="text-2xl sm:text-3xl font-mono text-[var(--text-faint)] tabular-nums">—</p>
          ) : (
            <>
              <p className="text-2xl sm:text-3xl font-mono font-semibold text-[var(--text)] tabular-nums leading-none">
                {formatGRT(availableGRT)}
              </p>
              <CopyButton text={plainGRT(availableGRT)} variant="icon" title="Copy available stake" />
            </>
          )}
          <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-wide">Available</span>
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-4 lg:grid-cols-7 gap-3 mt-3">
        <HeaderStat label="Provisioned">{grtOrDash(provisionedGRT)}</HeaderStat>
        <HeaderStat label="Allocated">{grtOrDash(allocatedGRT)}</HeaderStat>
        <HeaderStat label="Delegated">{`${formatGRT(delegatedGRT)} GRT`}</HeaderStat>
        <HeaderStat label="Ratio">
          {allocationRatio == null ? '—' : formatPercent(allocationRatio * 100, 1)}
        </HeaderStat>
        <HeaderStat label="Cut" title="Effective / stated reward cut">{cut}</HeaderStat>
        <HeaderStat label="30d APY">
          {rollingAPY30d == null ? '—' : `${rollingAPY30d.toFixed(2)}%`}
        </HeaderStat>
        <HeaderStat label="Accrued" title={accruedTitle}>
          {accrued.kind === 'unavailable' ? (
            <span className="text-[var(--text-faint)]">unavailable</span>
          ) : (
            <>
              {`${formatGRT(weiToGRT(accrued.wei))}${accrued.unread > 0 ? '+' : ''} GRT`}
              {ineligible ? <span className="ml-1 text-[10px] text-[var(--red-text)]">ineligible</span> : null}
            </>
          )}
        </HeaderStat>
      </div>
    </header>
  );
}

function grtOrDash(amount: number | null): string {
  return amount == null ? '—' : `${formatGRT(amount)} GRT`;
}

function HeaderStat({
  label,
  children,
  title,
}: {
  label: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div title={title}>
      <p className="text-[10px] text-[var(--text-faint)] uppercase tracking-wide">{label}</p>
      <p className="text-sm font-mono text-[var(--text)] tabular-nums mt-0.5">{children}</p>
    </div>
  );
}
