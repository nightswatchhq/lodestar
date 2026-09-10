'use client';

import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { parseEther } from 'viem';
import { cn } from '@/lib/utils';
import { ipfsHashToBytes32 } from '@/lib/studio/ipfs';
import { CONTRACTS } from '@/lib/wallet';
import { BOUNTY_BOARD_ABI, GRT_ABI, extractBountyId } from '@/lib/bountyBoard';
import { explainWriteError } from '@/lib/horizon-revert';
import { useContractStep } from '@/hooks/useContractStep';
import { BOUNTY_BOARD_DEPLOYED } from '../constants';
import { useRecordBounty } from '../api';
import type { StudioSubgraph } from '../types';

export type BountyWizardStep = 'form' | 'approve' | 'approving' | 'post' | 'posting' | 'done' | 'error';

export function PostBountyWizard({
  sg,
  sessionAddress,
  onClose,
}: {
  sg: StudioSubgraph;
  sessionAddress: string;
  onClose: () => void;
}) {
  const { address } = useAccount();
  const recordBounty = useRecordBounty();
  const [localStep, setLocalStep] = useState<BountyWizardStep>('form');
  const [amountGrt, setAmountGrt] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [message, setMessage] = useState('');
  const [bountyId, setBountyId] = useState<string | null>(null);

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- try/catch parse; intentionally hand-memoized
  const amountWei = useMemo(() => {
    try { return parseEther(amountGrt || '0'); } catch { return 0n; }
  }, [amountGrt]);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.grt,
    abi: GRT_ABI,
    functionName: 'allowance',
    args: address ? [address, CONTRACTS.bountyBoard] : undefined,
    query: { enabled: BOUNTY_BOARD_DEPLOYED && !!address },
  });

  const approveTx = useContractStep({
    onMined: () => {
      refetchAllowance();
      setStep('post');
    },
  });

  const postTx = useContractStep({
    onMined: (receipt) => {
      const id = extractBountyId(receipt.logs, CONTRACTS.bountyBoard);
      setBountyId(id?.toString() ?? null);

      // Recording the bounty is a POST, and the effect this replaces both suppressed
      // `exhaustive-deps` and keyed on a boolean, so a re-render could write the row twice.
      // `useContractStep` runs this once per transaction. Still best-effort: the bounty exists on
      // chain either way and the row is for discoverability. `useRecordBounty` invalidates the
      // board itself, so there is no second key to remember here.
      if (sg.deployment_id) {
        const expiresAt = expiresInDays
          ? new Date(Date.now() + parseInt(expiresInDays) * 86_400_000).toISOString()
          : null;
        recordBounty
          .mutateAsync({
            deployment_id: sg.deployment_id,
            slug: sg.slug,
            amount_grt: amountGrt,
            message: message || null,
            expires_at: expiresAt,
            chain_bounty_id: id?.toString() ?? null,
            post_tx_hash: receipt.transactionHash,
          })
          .catch(() => {});
      }
    },
  });

  const approvePending = approveTx.status === 'wallet';
  const postPending = postTx.status === 'wallet';
  const postTxHash = postTx.txHash;

  // Derived, not mirrored. The post transaction outranks the approval: once posting has started,
  // the approval being 'done' is history rather than the current state of the wizard.
  const txError = postTx.error ?? approveTx.error;
  const step: BountyWizardStep =
    txError ? 'error'
    : postTx.status === 'done' ? 'done'
    : postTx.status === 'mining' ? 'posting'
    : approveTx.status === 'mining' ? 'approving'
    : localStep;
  const errMsg = txError ? explainWriteError(txError) : '';
  const setStep = setLocalStep;

  const handleContinue = () => {
    if (!amountGrt || parseFloat(amountGrt) <= 0) return;
    const needsApproval = allowance === undefined || allowance < amountWei;
    setStep(needsApproval ? 'approve' : 'post');
  };

  const handleApprove = () => {
    approveTx.write({
      address: CONTRACTS.grt,
      abi: GRT_ABI,
      functionName: 'approve',
      args: [CONTRACTS.bountyBoard, amountWei],
    });
  };

  const handlePost = () => {
    if (!sg.deployment_id) return;
    const deploymentId = ipfsHashToBytes32(sg.deployment_id);
    const expiresAt = expiresInDays
      ? BigInt(Math.floor(Date.now() / 1000) + parseInt(expiresInDays) * 86400)
      : 0n;
    postTx.write({
      address: CONTRACTS.bountyBoard,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'post',
      args: [deploymentId, amountWei, expiresAt],
    });
  };

  const canClose = !['approving', 'posting'].includes(step);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-[var(--text)]">Post Sync Bounty</h3>
            <p className="text-xs text-amber-500 mt-0.5">Experimental: on-chain GRT escrow</p>
          </div>
          {canClose && (
            <button onClick={onClose} aria-label="Close" className="text-[var(--text-faint)] hover:text-[var(--text)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {step === 'form' && (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                GRT is locked on-chain. First indexer to sync and present a POI for this deployment wins.
              </p>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">
                  Bounty amount (GRT) <span className="text-[var(--red-text)]">*</span>
                </label>
                <input
                  type="number" min="1" step="any" placeholder="100"
                  value={amountGrt}
                  onChange={(e) => setAmountGrt(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-sm rounded-[var(--radius-button)]',
                    'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                    'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                  )}
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">Expires after</label>
                <select
                  aria-label="Expires after"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-sm rounded-[var(--radius-button)]',
                    'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                    'focus:outline-none focus:border-[var(--accent)]',
                  )}
                >
                  <option value="7">7 days</option>
                  <option value="14">14 days</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="">Never (cancel anytime after 72h)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">Message to indexers (optional)</label>
                <textarea
                  placeholder="Please sync ASAP, production depends on this."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  className={cn(
                    'w-full px-3 py-2 text-sm rounded-[var(--radius-button)] resize-none',
                    'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                    'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                  )}
                />
              </div>
              <p className="text-xs text-[var(--text-faint)] bg-[var(--bg-elevated)] rounded p-2.5 border border-[var(--border)]">
                GRT is locked for 72h before you can cancel. The contract verifies the POI on-chain, so no admin can interfere.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={!amountGrt || parseFloat(amountGrt) <= 0}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'approve' && (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                Approve the BountyBoard contract to spend <strong>{amountGrt} GRT</strong>.
              </p>
              <button
                onClick={handleApprove}
                disabled={approvePending}
                className="w-full px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {approvePending ? 'Waiting for wallet...' : 'Approve GRT'}
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-sm rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                Cancel
              </button>
            </>
          )}

          {step === 'approving' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Waiting for approval confirmation...</p>
              {approveTx.txHash && (
                <a href={`https://arbiscan.io/tx/${approveTx.txHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-text)] hover:underline font-mono">
                  {approveTx.txHash.slice(0, 20)}...
                </a>
              )}
            </div>
          )}

          {step === 'post' && (
            <>
              <div className="flex items-center gap-2 text-sm text-[var(--accent-text)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                GRT approved
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Lock <strong>{amountGrt} GRT</strong> in the BountyBoard contract on Arbitrum One.
              </p>
              <button
                onClick={handlePost}
                disabled={postPending}
                className="w-full px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {postPending ? 'Waiting for wallet...' : 'Post Bounty'}
              </button>
            </>
          )}

          {step === 'posting' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Locking GRT on-chain...</p>
              {postTxHash && (
                <a href={`https://arbiscan.io/tx/${postTxHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-text)] hover:underline font-mono">
                  {postTxHash.slice(0, 20)}...
                </a>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center py-8 gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--accent-dim)] flex items-center justify-center">
                <svg className="w-7 h-7 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-[var(--text)]">Bounty posted!</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {amountGrt} GRT locked on-chain. First indexer to sync and present a POI wins.
                </p>
                {bountyId !== null && (
                  <p className="text-xs text-[var(--text-faint)] font-mono mt-2">Bounty #{bountyId}</p>
                )}
              </div>
              <div className="flex gap-3">
                {postTxHash && (
                  <a href={`https://arbiscan.io/tx/${postTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-button)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                    View on Arbiscan
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--red-text)]">{errMsg || 'Something went wrong.'}</p>
              <button
                onClick={() => setStep('form')}
                className="w-full px-4 py-2 text-sm rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}