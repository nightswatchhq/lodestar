'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ActiveAllocation } from '@/lib/contracts/indexer-detail';
import { useSimulatorCandidates } from '@/hooks/useNetworkStats';
import { SIMULATOR_TOOLTIP, simulateAllocation, type OwnAllocation, type SimCandidate } from '@/lib/allocation-simulator';
import { queueBlock } from '@/lib/indexer-cli';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { CopyableId, truncatedQm } from '@/components/ui/CopyableId';
import { CopyButton } from '@/components/ui/CopyButton';
import { formatGRT, weiToGRT, cn } from '@/lib/utils';

const inputClass = cn(
  'w-full min-w-0 px-2 py-1 text-xs font-mono rounded-[var(--radius-button)]',
  'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
  'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
);

function num(text: string): number | null {
  const t = text.replace(/[,_\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function hashes(text: string): string[] {
  return text.split(/[\s,]+/).filter((h) => h.startsWith('Qm'));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-[var(--text-muted)]">
      {label}
      {children}
    </label>
  );
}

export function SimulatorPanel({
  allocations,
  availableGRT,
  annualIssuance,
  totalNetworkSignal,
}: {
  allocations: ActiveAllocation[] | undefined;
  availableGRT: number | null;
  annualIssuance: number;
  totalNetworkSignal: number;
}) {
  const candidatesQuery = useSimulatorCandidates();
  const [countCurrent, setCountCurrent] = useState(true);
  const [amountText, setAmountText] = useState<string | null>(null);
  const [minSignalText, setMinSignalText] = useState('100');
  const [maxPerText, setMaxPerText] = useState('');
  const [minAllocText, setMinAllocText] = useState('10000');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [skipText, setSkipText] = useState('');
  const [pinText, setPinText] = useState('');
  const [showUnchanged, setShowUnchanged] = useState(false);

  const own: OwnAllocation[] = useMemo(
    () => (allocations ?? []).map((a) => ({
      id: a.id,
      ipfsHash: a.subgraphDeployment.ipfsHash,
      amount: weiToGRT(a.allocatedTokens),
    })),
    [allocations],
  );
  const ownTotal = own.reduce((sum, a) => sum + a.amount, 0);

  const candidates: SimCandidate[] = useMemo(() => {
    const byHash = new Map<string, SimCandidate>();
    for (const d of candidatesQuery.data ?? []) {
      byHash.set(d.ipfsHash, {
        ipfsHash: d.ipfsHash,
        displayName: d.displayName,
        network: d.network,
        signal: weiToGRT(d.signalledTokens),
        stake: weiToGRT(d.stakedTokens),
        deniedSince: d.deniedSince,
      });
    }
    // The indexer's own deployments may sit outside the 200 most signalled.
    for (const a of allocations ?? []) {
      const d = a.subgraphDeployment;
      if (byHash.has(d.ipfsHash)) continue;
      byHash.set(d.ipfsHash, {
        ipfsHash: d.ipfsHash,
        displayName: d.displayName,
        network: null,
        signal: weiToGRT(d.signalledTokens),
        stake: weiToGRT(d.stakedTokens),
        deniedSince: d.deniedSince,
      });
    }
    return [...byHash.values()];
  }, [candidatesQuery.data, allocations]);

  const networks = useMemo(
    () => [...new Set(candidates.map((c) => c.network).filter((n): n is string => !!n))].sort(),
    [candidates],
  );

  const defaultAmount = Math.floor((availableGRT ?? 0) + (countCurrent ? 0 : ownTotal));
  const amount = amountText === null ? defaultAmount : (num(amountText) ?? 0);
  const skip = useMemo(() => hashes(skipText), [skipText]);
  const pinned = useMemo(() => hashes(pinText), [pinText]);

  const ready = candidatesQuery.data != null && annualIssuance > 0 && totalNetworkSignal > 0;
  const plan = useMemo(() => {
    if (!ready) return null;
    return simulateAllocation(candidates, own, {
      budget: amount,
      annualIssuance,
      totalSignal: totalNetworkSignal,
      minSignal: num(minSignalText) ?? 0,
      maxPerDeployment: num(maxPerText),
      minAllocation: num(minAllocText) ?? 1,
      excludeNetworks: excluded,
      skip,
      pinned,
      countCurrent,
    });
  }, [ready, candidates, own, amount, annualIssuance, totalNetworkSignal, minSignalText, maxPerText, minAllocText, excluded, skip, pinned, countCurrent]);

  const changed = plan?.rows.filter((r) => Math.abs(r.proposed - r.current) >= 1) ?? [];
  const unchanged = plan?.rows.filter((r) => Math.abs(r.proposed - r.current) < 1) ?? [];
  const shownRows = showUnchanged ? [...changed, ...unchanged] : changed;

  const addSkip = (hash: string) => setSkipText((t) => (hashes(t).includes(hash) ? t : [...hashes(t), hash].join(', ')));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation simulator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-[var(--text-muted)]">
          Every figure here is an estimate. {SIMULATOR_TOOLTIP} It reads the 200 most-signalled deployments and this
          indexer&apos;s own, and needs no agent.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Field label="GRT to allocate">
            <input
              className={inputClass}
              inputMode="decimal"
              value={amountText ?? String(defaultAmount)}
              onChange={(e) => setAmountText(e.target.value)}
              aria-label="GRT to allocate"
            />
          </Field>
          <Field label="Minimum signal (GRT)">
            <input className={inputClass} inputMode="decimal" value={minSignalText} onChange={(e) => setMinSignalText(e.target.value)} />
          </Field>
          <Field label="Maximum per deployment">
            <input className={inputClass} inputMode="decimal" placeholder="No cap" value={maxPerText} onChange={(e) => setMaxPerText(e.target.value)} />
          </Field>
          <Field label="Smallest new allocation">
            <input className={inputClass} inputMode="decimal" value={minAllocText} onChange={(e) => setMinAllocText(e.target.value)} />
          </Field>
          <Field label="Pin (Qm…, comma separated)">
            <input className={inputClass} value={pinText} onChange={(e) => setPinText(e.target.value)} />
          </Field>
          <Field label="Skip (Qm…, comma separated)">
            <input className={inputClass} value={skipText} onChange={(e) => setSkipText(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-[var(--text-muted)] mr-2">
            <input
              type="checkbox"
              checked={countCurrent}
              onChange={(e) => {
                setCountCurrent(e.target.checked);
                setAmountText(null);
              }}
            />
            Keep current allocations ({formatGRT(ownTotal)} GRT) and add on top
          </label>
          {networks.map((n) => {
            const off = excluded.includes(n);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setExcluded((xs) => (off ? xs.filter((x) => x !== n) : [...xs, n]))}
                className={cn(
                  'px-2 py-0.5 rounded-[var(--radius-button)] border font-mono',
                  off
                    ? 'border-[var(--border)] text-[var(--text-faint)] line-through'
                    : 'border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]',
                )}
                title={off ? 'Excluded; click to include' : 'Click to exclude'}
              >
                {n}
              </button>
            );
          })}
        </div>

        {candidatesQuery.isError ? (
          <p className="text-xs text-[var(--red-text)]">The deployment list could not be loaded, so there is nothing to plan over.</p>
        ) : !plan ? (
          <p className="text-xs text-[var(--text-muted)]">
            {candidatesQuery.data == null ? 'Loading deployments…' : 'Waiting for issuance and network signal.'}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-[var(--text-muted)]">Placed</p>
                <p className="font-mono text-[var(--text)]">{formatGRT(plan.placed)} GRT</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Est. rewards a day</p>
                <p className="font-mono text-[var(--text)]" title={SIMULATOR_TOOLTIP}>{formatGRT(plan.annualRewards / 365)} GRT</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Est. APR</p>
                <p className="font-mono text-[var(--text)]" title={SIMULATOR_TOOLTIP}>
                  {plan.placed > 0 ? `${((100 * plan.annualRewards) / plan.placed).toFixed(2)}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Current allocations, a day</p>
                <p className="font-mono text-[var(--text)]" title={SIMULATOR_TOOLTIP}>{formatGRT(plan.currentAnnualRewards / 365)} GRT</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                    <th className="py-1.5 pr-3 font-medium">Deployment</th>
                    <th className="py-1.5 px-3 font-medium text-right">Current</th>
                    <th className="py-1.5 px-3 font-medium text-right">Proposed</th>
                    <th className="py-1.5 px-3 font-medium text-right hidden sm:table-cell">Est. a day</th>
                    <th className="py-1.5 px-3 font-medium text-right" title={SIMULATOR_TOOLTIP}>Est. APR</th>
                    <th className="py-1.5 pl-3" />
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r) => (
                    <tr key={r.ipfsHash} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-1.5 pr-3 max-w-[16rem]">
                        <Link href={`/subgraphs/${r.ipfsHash}`} className="block truncate text-[var(--text)] hover:text-[var(--accent-text)]">
                          {r.displayName ?? truncatedQm(r.ipfsHash)}
                        </Link>
                        <CopyableId value={r.ipfsHash} title="Copy deployment ID" display={truncatedQm(r.ipfsHash)} className="text-[10px] text-[var(--text-faint)]" />
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-[var(--text-muted)]">{r.current > 0 ? formatGRT(r.current) : '—'}</td>
                      <td className={cn('py-1.5 px-3 text-right font-mono', r.proposed === 0 ? 'text-[var(--red-text)]' : 'text-[var(--text)]')}>
                        {r.proposed > 0 ? formatGRT(r.proposed) : 'close'}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-[var(--text-muted)] hidden sm:table-cell">{formatGRT(r.annualRewards / 365)}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-[var(--text)]">{r.proposed > 0 ? `${r.apr.toFixed(2)}%` : '—'}</td>
                      <td className="py-1.5 pl-3 text-right">
                        {!skip.includes(r.ipfsHash) && r.proposed > 0 ? (
                          <button type="button" onClick={() => addSkip(r.ipfsHash)} className="text-[var(--text-faint)] hover:text-[var(--text)]">
                            Skip
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {unchanged.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowUnchanged((v) => !v)}
                  className="mt-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  {showUnchanged ? 'Hide' : 'Show'} {unchanged.length} unchanged allocation{unchanged.length === 1 ? '' : 's'}
                </button>
              ) : null}
            </div>

            {plan.commands.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--text-muted)]">
                    {plan.commands.length} action{plan.commands.length === 1 ? '' : 's'} for indexer-cli
                  </p>
                  <CopyButton text={queueBlock(plan.commands)} />
                </div>
                <pre className="text-[11px] font-mono p-2 rounded-[var(--radius-button)] bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto text-[var(--text)]">
                  {queueBlock(plan.commands)}
                </pre>
              </div>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">Nothing to change.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
