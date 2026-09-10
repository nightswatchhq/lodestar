'use client';

import { useState } from 'react';
import { useReadContract } from 'wagmi';
import { cn } from '@/lib/utils';
import { CONTRACTS } from '@/lib/wallet';
import { BOUNTY_BOARD_ABI, SUBGRAPH_SERVICE_ABI } from '@/lib/bountyBoard';
import { explainWriteError } from '@/lib/horizon-revert';
import { useContractStep } from '@/hooks/useContractStep';
import { useMarkBountyClaimed, usePresentPoi } from '../api';
import type { SyncBounty } from '../types';

export function ClaimModal({ bounty, onClose }: { bounty: SyncBounty; onClose: () => void }) {
  const presentPoi = usePresentPoi();
  const { mutate: markClaimed } = useMarkBountyClaimed();
  const [allocationId, setAllocationId] = useState('');
  const [localStep, setLocalStep] = useState<'form' | 'claiming' | 'done' | 'error'>('form');

  const claimTx = useContractStep({
    onMined: () => {
      // Best-effort, and deliberately so: the chain is the source of truth for a claim and this
      // row is a convenience. The decision to ignore the failure is made here, once and visibly.
      markClaimed(bounty.id);
    },
  });

  // The wizard's own step machine still drives the rendering; these three lines are all that is
  // left of translating a transaction into it, and `useContractStep` guarantees `onMined` runs
  // once rather than on every render that happens to touch the effect's dependencies.
  const isPending = claimTx.status === 'wallet';
  const claimTxHash = claimTx.txHash;

  const step =
    claimTx.status === 'error' ? 'error'
    : claimTx.status === 'done' ? 'done'
    : claimTx.status === 'mining' ? 'claiming'
    : localStep;
  const errMsg = claimTx.error ? explainWriteError(claimTx.error) : '';
  const setStep = setLocalStep;

  const validAddress = allocationId.startsWith('0x') && allocationId.length === 42;

  // POI presentation state
  const [agentUrl, setAgentUrl] = useState('http://localhost:8000');
  const [agentToken, setAgentToken] = useState('');
  const [poiQueuing, setPoiQueuing] = useState(false);
  const [poiQueued, setPoiQueued] = useState(false);
  const [poiQueueError, setPoiQueueError] = useState('');

  const handlePresentPoi = async () => {
    if (!validAddress || !bounty.deployment_id) return;
    setPoiQueuing(true);
    setPoiQueueError('');
    setPoiQueued(false);
    try {
      const data = await presentPoi.mutateAsync({
        deploymentId: bounty.deployment_id,
        allocationId,
        agentUrl: agentUrl.trim(),
        agentToken: agentToken.trim() || undefined,
      });
      // A 200 can still carry an indexer-agent error, so this check is not the same as the
      // status check `studioFetch` now does.
      const errors = (data as { errors?: { message: string }[] }).errors;
      if (errors?.length) throw new Error(errors[0].message);
      setPoiQueued(true);
    } catch (e) {
      setPoiQueueError((e as Error).message);
    } finally {
      setPoiQueuing(false);
    }
  };

  // Poll allocation state from SubgraphService every 10s once an address is entered
  const { data: allocState } = useReadContract({
    address: CONTRACTS.subgraphService,
    abi: SUBGRAPH_SERVICE_ABI,
    functionName: 'getAllocation',
    args: validAddress ? [allocationId as `0x${string}`] : undefined,
    query: {
      enabled: validAddress && step !== 'done',
      refetchInterval: 10_000,
    },
  });

  // Read the on-chain bounty to get postedAt for the POI comparison
  const { data: chainBounty } = useReadContract({
    address: CONTRACTS.bountyBoard,
    abi: BOUNTY_BOARD_ABI,
    functionName: 'getBounty',
    args: bounty.chain_bounty_id ? [BigInt(bounty.chain_bounty_id)] : undefined,
    query: { enabled: !!bounty.chain_bounty_id && step !== 'done' },
  });

  const poiReady = !!(
    allocState &&
    chainBounty &&
    allocState.lastPOIPresentedAt > 0n &&
    allocState.lastPOIPresentedAt > (chainBounty as { postedAt: bigint }).postedAt
  );
  const allocationClosed = allocState ? allocState.closedAt > 0n : false;


  const handleClaim = () => {
    if (!bounty.chain_bounty_id || !validAddress) return;
    claimTx.write({
      address: CONTRACTS.bountyBoard,
      abi: BOUNTY_BOARD_ABI,
      functionName: 'claim',
      args: [BigInt(bounty.chain_bounty_id), allocationId as `0x${string}`],
    });
  };

  const canClose = step !== 'claiming';

  // GraphQL snippet indexers can run against their own management API
  const poiMutation = `mutation {
  queueActions(actions: [{
    type: presentPOI,
    deploymentID: "${bounty.deployment_id}",
    allocationID: "${allocationId || '<your-allocation-id>'}",
    protocolNetwork: "eip155:42161",
    status: approved, priority: 0,
    isLegacy: false, source: "manual",
    reason: "bounty claim"
  }]) { id type status failureReason }
}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold text-[var(--text)]">Claim Bounty #{bounty.chain_bounty_id}</h3>
            <p className="text-xs text-[var(--text-faint)] font-mono mt-0.5">{bounty.amount_grt} GRT</p>
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
              {/* Steps checklist */}
              <ol className="space-y-2 text-xs text-[var(--text-muted)]">
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[10px]">1</span>
                  <span>Deploy the subgraph to your graph-node and wait for it to sync</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[10px]">2</span>
                  <span>Allocate to this deployment via your indexer-agent (<code>setIndexingRule</code> or <code>queueActions</code>)</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[10px]">3</span>
                  <span>Present a POI via your management API (port 8000). See below</span>
                </li>
                <li className="flex gap-2">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[var(--accent-dim)] text-[var(--accent-text)] flex items-center justify-center font-semibold text-[10px]">4</span>
                  <span>Enter your allocation ID here. Both checks must be green before the Claim button enables</span>
                </li>
              </ol>
              <p className="text-xs text-[var(--text-faint)]">
                New to this?{' '}
                <a href="https://learn-thegraph.com/dispatches/sync-bounty-indexer-guide/" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] hover:underline">
                  Full guide for indexers →
                </a>
              </p>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">
                  Allocation ID <span className="text-[var(--red-text)]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={allocationId}
                  onChange={(e) => setAllocationId(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-button)]',
                    'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                    'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                  )}
                />
                <p className="text-xs text-[var(--text-faint)] mt-1">
                  The <code>0x</code> address created when you allocated, not your indexer address.
                  Query <code>{'{ allocations(filter: {}) { id subgraphDeployment } }'}</code> on your management API, or find a{' '}
                  <code>ServiceStarted</code> event on{' '}
                  <a href={`https://arbiscan.io/address/${CONTRACTS.subgraphService}#events`} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] hover:underline">
                    Arbiscan
                  </a>.
                </p>
              </div>

              {/* On-chain status panel */}
              {validAddress && allocState && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-faint)]">Allocation</span>
                    <span className={allocationClosed ? 'text-[var(--red-text)]' : 'text-[var(--green)]'}>
                      {allocationClosed ? 'Closed, cannot claim' : 'Open'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-faint)]">POI verified on-chain</span>
                    <span className={poiReady ? 'text-[var(--green)]' : 'text-[var(--text-muted)]'}>
                      {poiReady ? 'Yes, ready to claim' : 'Not yet (polling every 10s)'}
                    </span>
                  </div>
                </div>
              )}

              {/* POI — interactive form when allocation open but POI not yet confirmed */}
              {validAddress && allocState && !allocationClosed && !poiReady && (
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 space-y-3">
                  <p className="text-xs font-medium text-[var(--text-muted)]">Step 3: Present a POI</p>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-[var(--text-faint)] mb-1">Management API URL</label>
                      <input
                        type="text"
                        value={agentUrl}
                        onChange={(e) => setAgentUrl(e.target.value)}
                        placeholder="http://localhost:8000"
                        className={cn(
                          'w-full px-2.5 py-1.5 text-xs font-mono rounded-[var(--radius-button)]',
                          'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
                          'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                        )}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-faint)] mb-1">Basic auth <span className="opacity-60">(user:password, optional)</span></label>
                      <input
                        type="password"
                        value={agentToken}
                        onChange={(e) => setAgentToken(e.target.value)}
                        placeholder="user:password"
                        className={cn(
                          'w-full px-2.5 py-1.5 text-xs font-mono rounded-[var(--radius-button)]',
                          'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text)]',
                          'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                        )}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handlePresentPoi}
                    disabled={poiQueuing || poiQueued || !agentUrl.trim()}
                    className="w-full px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                  >
                    {poiQueuing ? 'Queuing...' : poiQueued ? 'Queued ✓, waiting for chain confirmation' : 'Queue POI Action'}
                  </button>
                  {poiQueueError && (
                    <p className="text-xs text-[var(--red-text)]">{poiQueueError}</p>
                  )}
                  {!poiQueued && (
                    <details className="text-xs">
                      <summary className="text-[var(--text-faint)] cursor-pointer hover:text-[var(--text-muted)]">Do it manually instead</summary>
                      <pre className="mt-2 text-[10px] font-mono text-[var(--text-faint)] whitespace-pre-wrap break-all leading-relaxed">
                        {poiMutation}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClaim}
                  disabled={isPending || !poiReady}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isPending ? 'Waiting for wallet...' : 'Claim GRT'}
                </button>
              </div>
            </>
          )}

          {step === 'claiming' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Transaction submitted...</p>
              {claimTxHash && (
                <a href={`https://arbiscan.io/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-text)] hover:underline font-mono">
                  {claimTxHash.slice(0, 20)}...
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
                <p className="font-semibold text-[var(--text)]">Bounty claimed!</p>
                <p className="text-sm text-[var(--text-muted)] mt-1">{bounty.amount_grt} GRT sent to your wallet.</p>
              </div>
              <div className="flex gap-3">
                {claimTxHash && (
                  <a href={`https://arbiscan.io/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 text-sm border border-[var(--border)] rounded-[var(--radius-button)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors">
                    View on Arbiscan
                  </a>
                )}
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity">
                  Done
                </button>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <p className="text-xs text-[var(--red-text)] font-mono whitespace-pre-wrap break-all">{errMsg}</p>
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