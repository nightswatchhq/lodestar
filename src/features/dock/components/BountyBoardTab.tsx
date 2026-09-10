'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { cn, shortenAddress } from '@/lib/utils';
import { CONTRACTS } from '@/lib/wallet';
import { BOUNTY_BOARD_ABI } from '@/lib/bountyBoard';
import { CopyButton } from '@/components/ui/CopyButton';
import { BOUNTY_BOARD_DEPLOYED } from '../constants';
import { ClaimModal } from './ClaimModal';
import { dockKeys, useBounties } from '../api';
import type { SyncBounty } from '../types';
import { useDialog } from '@/hooks/useDialog';
import { useContractStep, type ContractStep } from '@/hooks/useContractStep';
import { explainWriteError } from '@/lib/horizon-revert';

export function BountyBoardTab({ sessionAddress }: { sessionAddress: string }) {
  const { confirm, dialog } = useDialog();
  const queryClient = useQueryClient();
  // The whole board, sharing a cache with the per-deployment read in the detail modal.
  const { data: bountiesData, isLoading, isError } = useBounties();
  const [claimTarget, setClaimTarget] = useState<SyncBounty | null>(null);

  const [howToOpen, setHowToOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const [queryOpenIds, setQueryOpenIds] = useState<Set<number>>(new Set());
  // Mount-stable "now" (ms) — keeps render pure (no Date.now() during render).
  const [nowMs] = useState(() => Date.now());

  const toggleQuery = (id: number) =>
    setQueryOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Both of these used to end at the wallet: the hash was recorded on broadcast and the row said
  // "Cancelling..." from then on, whatever the chain did with it. A reverted cancel looked exactly
  // like one that worked, while the GRT stayed locked.
  const cancelStep = useContractStep({
    onMined: () => queryClient.invalidateQueries({ queryKey: dockKeys.allBounties }),
  });
  const refundStep = useContractStep({
    onMined: () => queryClient.invalidateQueries({ queryKey: dockKeys.allBounties }),
  });

  const handleCancel = async (bounty: SyncBounty) => {
    if (!bounty.chain_bounty_id) return;
    if (
      !(await confirm(`The GRT locked in bounty #${bounty.chain_bounty_id} returns to your wallet, and the bounty stops being claimable.`, {
        title: 'Cancel this bounty?',
        confirmLabel: 'Cancel the bounty',
        danger: true,
      }))
    ) {
      return;
    }
    cancelStep.reset();
    setCancellingId(bounty.chain_bounty_id);
    cancelStep.write({
      address: CONTRACTS.bountyBoard,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'cancel',
      args: [BigInt(bounty.chain_bounty_id)],
    });
  };

  const handleRefund = async (bounty: SyncBounty) => {
    if (!bounty.chain_bounty_id) return;
    if (
      !(await confirm(`Bounty #${bounty.chain_bounty_id} has expired unclaimed. The locked GRT returns to the developer who posted it.`, {
        title: 'Refund this expired bounty?',
        confirmLabel: 'Refund it',
      }))
    ) {
      return;
    }
    refundStep.reset();
    setRefundingId(bounty.chain_bounty_id);
    refundStep.write({
      address: CONTRACTS.bountyBoard,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'refundExpired',
      args: [BigInt(bounty.chain_bounty_id)],
    });
  };

  const bounties = bountiesData ?? [];

  if (!BOUNTY_BOARD_DEPLOYED) {
    return (
      <div className="py-16 text-center">
        <p className="text-[var(--text-muted)] text-sm">On-chain bounty contract not yet deployed.</p>
        <p className="text-xs text-[var(--text-faint)] mt-1">Set <code>NEXT_PUBLIC_BOUNTY_BOARD_ADDRESS</code> after deployment.</p>
      </div>
    );
  }

  return (
    <>
      {dialog}
      <div className="space-y-4">
        <div className="p-4 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <p className="text-sm text-amber-600 dark:text-amber-400">
            <strong>Experimental.</strong> GRT is locked on-chain in the BountyBoard contract: fully trustless, no admin.
            The contract verifies on-chain that the indexer has an open allocation with a POI submitted after the bounty was posted.
            First valid claim wins.
          </p>
        </div>

        {/* How indexers claim — collapsible */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] overflow-hidden">
          <button
            onClick={() => setHowToOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-surface)] transition-colors text-left"
          >
            <span>How do indexers claim?</span>
            <svg className={cn('w-4 h-4 text-[var(--text-faint)] transition-transform', howToOpen && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {howToOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)]">
              <ol className="mt-3 space-y-3 text-sm text-[var(--text-muted)]">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[11px] mt-0.5">1</span>
                  <div>
                    <p className="font-medium text-[var(--text)]">Deploy the subgraph to your graph-node</p>
                    <p className="text-xs mt-0.5">Use the deployment ID shown on the bounty. Call <code>subgraph_create</code> then <code>subgraph_deploy</code> on your graph-node admin API (port 8020). Wait for <code>synced: true</code>.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[11px] mt-0.5">2</span>
                  <div>
                    <p className="font-medium text-[var(--text)]">Allocate to the deployment</p>
                    <p className="text-xs mt-0.5">Use <code>setIndexingRule</code> with <code>decisionBasis: always</code> or queue an <code>allocate</code> action via your indexer-agent management API (port 8000). Note your allocation ID; it&apos;s a <code>0x</code> address, not your indexer address.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[11px] mt-0.5">3</span>
                  <div>
                    <p className="font-medium text-[var(--text)]">Present a POI</p>
                    <p className="text-xs mt-0.5">Queue a <code>presentPOI</code> action via your management API. This calls <code>SubgraphService.collect()</code> and sets <code>lastPOIPresentedAt</code> on-chain, the timestamp the contract checks. Keep your allocation <strong>open</strong> until after claiming.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[11px] mt-0.5">4</span>
                  <div>
                    <p className="font-medium text-[var(--text)]">Click Claim and sign</p>
                    <p className="text-xs mt-0.5">Open the claim modal, enter your allocation ID. The status panel polls the chain every 10s. Once both checks are green, click <strong>Claim GRT</strong> and sign with your indexer wallet. GRT is paid out immediately.</p>
                  </div>
                </li>
              </ol>
              <a
                href="https://learn-thegraph.com/dispatches/sync-bounty-indexer-guide/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-[var(--accent-text)] hover:underline mt-1"
              >
                Full step-by-step guide with code snippets →
              </a>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg shimmer" />)}
          </div>
        ) : isError ? (
          <p className="text-sm text-[var(--red-text)] py-4">Failed to load bounties. Please refresh.</p>
        ) : bounties.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[var(--text-muted)] text-sm">No bounties posted yet.</p>
            <p className="text-xs text-[var(--text-faint)] mt-1">
              Open a subgraph from the My Subgraphs tab and click Post Bounty.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {bounties.map((b) => {
              const isOwn = sessionAddress.toLowerCase() === b.developer_address?.toLowerCase();
              const isClaimed = b.status === 'claimed';
              // Expired = the cache says so, or the deadline has passed (guard against
              // a not-yet-reconciled row showing a Claim button that would revert).
              const isExpired =
                !isClaimed &&
                (b.status === 'expired' ||
                  (!!b.expires_at && nowMs > new Date(b.expires_at).getTime()));
              // Only the row a step is acting on reads that step's state. One transaction runs at
              // a time, so this is the whole of the bookkeeping the old hash maps were doing.
              const cancelling = cancellingId === b.chain_bounty_id ? cancelStep : null;
              const refunding = refundingId === b.chain_bounty_id ? refundStep : null;
              const cancelUnlockAt = new Date(new Date(b.created_at).getTime() + 72 * 60 * 60 * 1000);
              const cancelUnlocked = nowMs >= cancelUnlockAt.getTime();
              const isCancelling = cancelling?.status === 'wallet' || cancelling?.status === 'mining';
              const isRefunding = refunding?.status === 'wallet' || refunding?.status === 'mining';
              const queryOpen = queryOpenIds.has(b.id);

              return (
                <div
                  key={b.id}
                  className={cn(
                    'p-4 rounded-lg border bg-[var(--bg-elevated)]',
                    isClaimed ? 'border-[var(--green)]/20' : 'border-[var(--border)]',
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-[var(--text)] truncate">{b.deployment_id}</span>
                        <CopyButton text={b.deployment_id} />
                        <Link href={`/subgraphs/${b.deployment_id}`} className="text-xs text-[var(--accent-text)] hover:underline flex-shrink-0">
                          View
                        </Link>
                        {b.chain_bounty_id && (
                          <a
                            href={`https://arbiscan.io/address/${CONTRACTS.bountyBoard}#readContract`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[var(--text-faint)] hover:text-[var(--accent-text)] transition-colors"
                          >
                            #{b.chain_bounty_id} ↗
                          </a>
                        )}
                        {isClaimed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--green-dim)] text-[var(--green)] font-medium">
                            Claimed
                          </span>
                        )}
                        {isExpired && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--amber-dim)] text-[var(--amber)] font-medium">
                            Expired
                          </span>
                        )}
                      </div>
                      {b.message && (
                        <p className="text-xs text-[var(--text-muted)] mt-1 italic">&ldquo;{b.message}&rdquo;</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-[var(--text-faint)]">by {shortenAddress(b.developer_address)}</span>
                        {b.expires_at && !isClaimed && (
                          <span className="text-xs text-[var(--text-faint)]">
                            expires {new Date(b.expires_at).toLocaleDateString()}
                          </span>
                        )}
                        {isClaimed && b.claimed_at && (
                          <span className="text-xs text-[var(--text-faint)]">
                            claimed {new Date(b.claimed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={cn('text-base font-semibold', (isClaimed || isExpired) ? 'text-[var(--text-muted)] line-through' : 'text-[var(--accent-text)]')}>
                        {b.amount_grt} GRT
                      </span>
                      {isClaimed ? (
                        <button
                          onClick={() => toggleQuery(b.id)}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] transition-colors',
                            queryOpen
                              ? 'bg-[var(--accent-dim)] text-[var(--accent-text)]'
                              : 'border border-[var(--accent)]/40 text-[var(--accent-text)] hover:bg-[var(--accent-dim)]',
                          )}
                        >
                          {queryOpen ? 'Hide Query' : 'Query →'}
                        </button>
                      ) : isExpired && b.chain_bounty_id ? (
                        refunding && refunding.status !== 'idle' ? (
                          <StepCell
                            step={refunding}
                            pending="Refunding"
                            done="Refunded"
                            failed="Refund failed"
                          />
                        ) : isOwn ? (
                          <button
                            onClick={() => handleRefund(b)}
                            disabled={isRefunding}
                            className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent-text)] hover:border-[var(--accent)] transition-colors disabled:opacity-50"
                            title="Return the locked GRT to the developer"
                          >
                            {isRefunding ? 'Waiting...' : 'Refund'}
                          </button>
                        ) : (
                          <span className="text-xs text-[var(--text-faint)]">Expired</span>
                        )
                      ) : isOwn && b.chain_bounty_id ? (
                        cancelling && cancelling.status !== 'idle' ? (
                          <StepCell
                            step={cancelling}
                            pending="Cancelling"
                            done="Cancelled"
                            failed="Cancel failed"
                          />
                        ) : cancelUnlocked ? (
                          <button
                            onClick={() => handleCancel(b)}
                            disabled={isCancelling}
                            className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--red-text)] hover:border-[var(--red)] transition-colors disabled:opacity-50"
                          >
                            {isCancelling ? 'Waiting...' : 'Cancel'}
                          </button>
                        ) : (
                          <div className="relative group">
                            <button disabled className="px-3 py-1.5 text-xs rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-faint)] opacity-50 cursor-not-allowed">
                              Cancel
                            </button>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs whitespace-nowrap bg-[var(--bg-elevated)] border border-[var(--border)] rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                              Unlocks {cancelUnlockAt.toLocaleString()}
                            </div>
                          </div>
                        )
                      ) : !isOwn && b.chain_bounty_id ? (
                        <button
                          onClick={() => setClaimTarget(b)}
                          className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                        >
                          Claim
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {claimTarget && <ClaimModal bounty={claimTarget} onClose={() => setClaimTarget(null)} />}
    </>
  );
}

/**
 * What one row's transaction is doing, including the two outcomes it used to have no way to show.
 *
 * `wallet` and `mining` were both "Cancelling..." before; `done` and `error` did not exist, so a
 * transaction that reverted read as one still on its way.
 */
function StepCell({
  step,
  pending,
  done,
  failed,
}: {
  step: ContractStep;
  pending: string;
  done: string;
  failed: string;
}) {
  if (step.status === 'error') {
    return (
      <span className="text-xs text-[var(--red-text)]" title={explainWriteError(step.error)}>
        {failed}
      </span>
    );
  }

  if (step.status === 'done') {
    return <span className="text-xs text-[var(--green)]">{done}</span>;
  }

  const label = step.status === 'wallet' ? 'Waiting for your wallet' : `${pending}\u2026`;
  return step.txHash ? (
    <a
      href={`https://arbiscan.io/tx/${step.txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-[var(--text-faint)] hover:underline"
    >
      {label}
    </a>
  ) : (
    <span className="text-xs text-[var(--text-faint)]">{label}</span>
  );
}
