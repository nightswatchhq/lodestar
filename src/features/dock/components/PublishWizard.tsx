'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ipfsHashToBytes32 } from '@/lib/studio/ipfs';
import { CONTRACTS } from '@/lib/wallet';
import { explainWriteError } from '@/lib/horizon-revert';
import { useContractStep } from '@/hooks/useContractStep';
import { GNS_ABI } from '../abi';
import { extractSubgraphId } from '../receipts';
import { useUploadMetadata } from '../api';
import type { StudioSubgraph } from '../types';

export type PublishStep = 'confirm' | 'uploading' | 'wallet' | 'mining' | 'done' | 'error';

export function PublishWizard({
  sg,
  onClose,
  onPublished,
}: {
  sg: StudioSubgraph;
  onClose: () => void;
  onPublished: (txHash: string, versionLabel: string) => void;
}) {
  const uploadMetadata = useUploadMetadata();
  // Only the phases before the transaction are state. Everything from the wallet prompt onwards is
  // derived from `publishTx.status` below, because keeping a second copy of it in `step` means an
  // effect to mirror one into the other, and an effect that sets state during render is the
  // cascade the linter is right to object to.
  const [localStep, setLocalStep] = useState<PublishStep>('confirm');
  const [localErr, setLocalErr] = useState('');
  const [metaHashes, setMetaHashes] = useState<{
    subgraphMetaBytes32: `0x${string}`;
    versionMetaBytes32: `0x${string}`;
  } | null>(null);
  const [versionLabel, setVersionLabel] = useState('');

  const isNewVersion = Boolean(sg.published_subgraph_id && !sg.published_subgraph_id.startsWith('0x'));

  // `onPublished` PATCHes the subgraph row, so running it twice writes twice. The effect it
  // replaces was keyed on a boolean and did not list `versionLabel` among its dependencies, so it
  // could both re-run and, when it did, publish under a label the user had since changed.
  const publishTx = useContractStep({
    onMined: (receipt) => {
      const hash = receipt.transactionHash;
      const result = isNewVersion
        ? hash
        : (extractSubgraphId(receipt.logs, CONTRACTS.gns) ?? hash);
      onPublished(result, versionLabel);
    },
  });

  const walletPending = publishTx.status === 'wallet';
  const minedTxHash = publishTx.txHash;

  const step: PublishStep =
    publishTx.status === 'error' ? 'error'
    : publishTx.status === 'done' ? 'done'
    : publishTx.status === 'mining' ? 'mining'
    : localStep;
  const errMsg = publishTx.error ? explainWriteError(publishTx.error) : localErr;
  const setStep = setLocalStep;
  const setErrMsg = setLocalErr;

  const handleUpload = async () => {
    setStep('uploading');
    try {
      const data = (await uploadMetadata.mutateAsync({
        displayName: sg.display_name ?? '',
        description: sg.description ?? undefined,
        versionLabel: versionLabel.trim() || undefined,
      })) as {
        subgraphMetaBytes32: `0x${string}`;
        versionMetaBytes32: `0x${string}`;
      };
      setMetaHashes(data);
      setStep('wallet');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'IPFS upload failed');
      setStep('error');
    }
  };

  const handleWriteContract = () => {
    if (!metaHashes || !sg.deployment_id) return;
    if (isNewVersion && sg.published_subgraph_id) {
      publishTx.write({
        address: CONTRACTS.gns,
        abi: GNS_ABI,
        functionName: 'publishNewVersion',
        args: [
          BigInt(sg.published_subgraph_id),
          ipfsHashToBytes32(sg.deployment_id),
          metaHashes.versionMetaBytes32,
        ],
      });
    } else {
      publishTx.write({
        address: CONTRACTS.gns,
        abi: GNS_ABI,
        functionName: 'publishNewSubgraph',
        args: [
          ipfsHashToBytes32(sg.deployment_id),
          metaHashes.versionMetaBytes32,
          metaHashes.subgraphMetaBytes32,
        ],
      });
    }
  };

  const canClose = step !== 'uploading' && step !== 'mining';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text)]">Publish on The Graph</h3>
          {canClose && (
            <button onClick={onClose} aria-label="Close" className="text-[var(--text-faint)] hover:text-[var(--text)]">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {step === 'confirm' && (
            <>
              <p className="text-sm text-[var(--text-muted)]">
                {isNewVersion
                  ? <>Publishing a new version, which calls <code className="font-mono text-xs bg-[var(--bg-elevated)] px-1 rounded">GNS.publishNewVersion</code> on Arbitrum One.</>
                  : <>Uploads metadata to IPFS and calls <code className="font-mono text-xs bg-[var(--bg-elevated)] px-1 rounded">GNS.publishNewSubgraph</code> on Arbitrum One.</>}
              </p>
              <div className="space-y-0 text-sm divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="flex gap-3 px-4 py-2.5">
                  <span className="text-[var(--text-faint)] w-28 flex-shrink-0 text-xs">Subgraph</span>
                  <span className="text-[var(--text)] font-mono text-xs truncate">{sg.slug}</span>
                </div>
                {isNewVersion && sg.published_subgraph_id && (
                  <div className="flex gap-3 px-4 py-2.5">
                    <span className="text-[var(--text-faint)] w-28 flex-shrink-0 text-xs">Subgraph #</span>
                    <span className="text-[var(--text)] font-mono text-xs truncate">{sg.published_subgraph_id}</span>
                  </div>
                )}
                <div className="flex gap-3 px-4 py-2.5">
                  <span className="text-[var(--text-faint)] w-28 flex-shrink-0 text-xs">New deployment</span>
                  <span className="text-[var(--text)] font-mono text-xs truncate">{sg.deployment_id}</span>
                </div>
                {sg.display_name && (
                  <div className="flex gap-3 px-4 py-2.5">
                    <span className="text-[var(--text-faint)] w-28 flex-shrink-0 text-xs">Display name</span>
                    <span className="text-[var(--text)] text-sm">{sg.display_name}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1.5">
                  Version label <span className="text-[var(--text-faint)]">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="v0.0.1"
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  className={cn(
                    'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-button)]',
                    'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                    'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                  )}
                />
              </div>
              <p className="text-xs text-[var(--text-faint)]">
                A wallet transaction is required. Gas on Arbitrum is usually &lt;$0.01.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {step === 'uploading' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Uploading metadata to IPFS...</p>
            </div>
          )}

          {step === 'wallet' && metaHashes && (
            <>
              <div className="flex items-center gap-2 text-sm text-[var(--accent-text)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Metadata uploaded to IPFS
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                Confirm the transaction in your wallet to publish on The Graph Network.
              </p>
              <button
                onClick={handleWriteContract}
                disabled={walletPending}
                className="w-full px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {walletPending ? 'Waiting for wallet...' : 'Confirm in Wallet'}
              </button>
            </>
          )}

          {step === 'mining' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
              <p className="text-sm text-[var(--text-muted)]">Transaction submitted. Waiting for confirmation...</p>
              {minedTxHash && (
                <a
                  href={`https://arbiscan.io/tx/${minedTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--accent-text)] hover:underline font-mono"
                >
                  {minedTxHash.slice(0, 20)}...
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
                <p className="font-semibold text-[var(--text)]">
                  {isNewVersion ? 'New version published!' : 'Published!'}
                </p>
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {isNewVersion
                    ? 'Indexers will migrate to the new deployment.'
                    : 'Your subgraph is now live on The Graph Network.'}
                </p>
              </div>
              <div className="w-full p-3 rounded-lg bg-[var(--accent-dim)] border border-[var(--accent)]/20 text-left">
                <p className="text-xs font-medium text-[var(--accent-text)] mb-1">Next: attract indexers</p>
                <p className="text-xs text-[var(--text-muted)]">
                  Signal GRT on your subgraph to show indexers it&apos;s worth syncing. It may take a few minutes to appear in Curate after publishing.
                </p>
                <a
                  href={`/curate?deployment=${sg.deployment_id ?? ''}`}
                  className="inline-block mt-2 text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  Go to Curate →
                </a>
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-[var(--red-text)]">{errMsg || 'Something went wrong.'}</p>
              <button
                onClick={() => setStep('confirm')}
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