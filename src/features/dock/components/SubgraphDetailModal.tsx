'use client';

import { useEffect, useState } from 'react';
import { useWaitForTransactionReceipt } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CONTRACTS } from '@/lib/wallet';
import { SubgraphLifecyclePanel } from './SubgraphLifecyclePanel';
import { NODE_URL } from '../constants';
import { CopyButton } from '@/components/ui/CopyButton';
import { extractSubgraphId } from '../receipts';
import { CodeBlock } from './CodeBlock';
import { PublishWizard } from './PublishWizard';
import { DeployKeyPanel } from './DeployKeyPanel';
import { useBounties, useDeleteSubgraph, useUpdateSubgraph } from '../api';
import type { StudioSubgraph } from '../types';
import { useDialog } from '@/hooks/useDialog';

export function SubgraphDetailModal({
  sg: initialSg,
  sessionAddress,
  onClose,
  onUpdated,
  onPublished,
  onDelete,
}: {
  sg: StudioSubgraph;
  sessionAddress: string;
  onClose: () => void;
  onUpdated: (sg: StudioSubgraph) => void;
  onPublished: (id: number, txHash: string) => void;
  onDelete: (id: number) => void;
}) {
  const [sg, setSg] = useState(initialSg);
  const [displayName, setDisplayName] = useState(sg.display_name ?? '');
  const [description, setDescription] = useState(sg.description ?? '');
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const updateSubgraph = useUpdateSubgraph();

  // Shares the board's cache rather than reading the same table separately, which is how the two
  // could show different bounties for the same deployment at the same moment.
  const { data: bountiesForDeployment } = useBounties({
    deployment: sg.deployment_id ?? undefined,
    enabled: Boolean(sg.deployment_id),
  });
  const activeBounties = bountiesForDeployment?.filter((b) => b.status === 'open');

  /** Set when the resolved NFT id could not be written back, which hides the lifecycle actions. */
  const [nftIdError, setNftIdError] = useState<string | null>(null);

  // Auto-resolve legacy tx hash → on-chain subgraph NFT ID
  const legacyTxHash = (
    sg.published_subgraph_id?.startsWith('0x') ? sg.published_subgraph_id as `0x${string}` : undefined
  );
  const { data: legacyReceipt, isPending: isResolvingNftId } = useWaitForTransactionReceipt({ hash: legacyTxHash, chainId: arbitrum.id });
  useEffect(() => {
    if (!legacyReceipt) return;
    const nftId = extractSubgraphId(legacyReceipt.logs, CONTRACTS.gns);
    if (!nftId) return;
    // Not best-effort: `published_subgraph_id` staying a tx hash is what hides the on-chain
    // lifecycle actions, so a swallowed failure here quietly takes transfer and deprecate away
    // from this subgraph and leaves no trace of why.
    updateSubgraph
      .mutateAsync({ id: sg.id, patch: { published_subgraph_id: nftId } })
      .then(() => {
        const updated = { ...sg, published_subgraph_id: nftId };
        setSg(updated);
        onUpdated(updated);
      })
      .catch((e) => setNftIdError(e instanceof Error ? e.message : String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyReceipt]);

  const isPublished = Boolean(sg.published_subgraph_id);
  const subgraphNftId = sg.published_subgraph_id && !sg.published_subgraph_id.startsWith('0x')
    ? sg.published_subgraph_id : null;
  const hasNewDeployment = Boolean(
    sg.deployment_id && sg.last_published_deployment_id !== null && sg.deployment_id !== sg.last_published_deployment_id,
  );
  const canPublish = Boolean(sg.deployment_id) && (!isPublished || (subgraphNftId !== null && hasNewDeployment));
  const publishLabel = isPublished ? 'Update Version' : 'Publish';

  const handleSave = async () => {
    setSaving(true);
    setSaveOk(false);
    try {
      await updateSubgraph.mutateAsync({
        id: sg.id,
        patch: { display_name: displayName || null, description: description || null },
      });
      const updated = { ...sg, display_name: displayName || null, description: description || null };
      setSg(updated);
      onUpdated(updated);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const { confirm, dialog } = useDialog();
  const deleteSubgraph = useDeleteSubgraph();

  const handleDelete = async () => {
    if (
      !(await confirm(`Removing "${sg.slug}" only affects this Dock. Anything already published on chain stays published.`, {
        title: 'Remove this subgraph?',
        confirmLabel: 'Remove it',
        danger: true,
      }))
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      // Previously the response was not looked at and `onDelete` ran regardless, so a refused
      // delete removed the row from the list and the subgraph reappeared on the next load.
      await deleteSubgraph.mutateAsync(sg.id);
      onDelete(sg.id);
      onClose();
    } catch (e) {
      setDeleting(false);
      setDeleteError(e instanceof Error ? e.message : 'Could not remove the subgraph');
    }
  };

  const handlePublished = async (result: string, versionLabel: string) => {
    const trimLabel = versionLabel.trim() || null;
    if (subgraphNftId === null) {
      await updateSubgraph.mutateAsync({
        id: sg.id,
        patch: {
          published_subgraph_id: result,
          version_label: trimLabel,
          last_published_deployment_id: sg.deployment_id,
        },
      });
      const updated = { ...sg, published_subgraph_id: result, version_label: trimLabel, last_published_deployment_id: sg.deployment_id };
      setSg(updated);
      onUpdated(updated);
      onPublished(sg.id, result);
    } else {
      await updateSubgraph.mutateAsync({
        id: sg.id,
        patch: { version_label: trimLabel, last_published_deployment_id: sg.deployment_id },
      });
      const updated = { ...sg, version_label: trimLabel, last_published_deployment_id: sg.deployment_id };
      setSg(updated);
      onUpdated(updated);
    }
  };

  return (
    <>
      {dialog}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-3xl bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] shadow-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--accent-dim)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[var(--text)] truncate">
                    {sg.display_name || sg.slug.split('/').pop()}
                  </span>
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0',
                    isPublished
                      ? 'bg-[var(--accent-dim)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-faint)] border border-[var(--border)]',
                  )}>
                    {isPublished ? 'Published' : 'Draft'}
                  </span>
                  {sg.version_label && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-mono flex-shrink-0 bg-[var(--bg-elevated)] text-[var(--text-faint)] border border-[var(--border)]">
                      {sg.version_label}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-faint)] font-mono truncate">{sg.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Publish / Update Version */}
              {isPublished && !canPublish && sg.deployment_id ? (
                <div className="relative group">
                  <button
                    disabled
                    className="px-4 py-1.5 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white opacity-40 cursor-not-allowed"
                  >
                    Update Version
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-[var(--text)] bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {!hasNewDeployment
                      ? 'No new deployment. Run graph deploy again (step 3) first'
                      : 'Resolving on-chain subgraph ID. Try again in a moment'}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[var(--border)]" />
                  </div>
                </div>
              ) : canPublish && (
                <button
                  onClick={() => setShowPublish(true)}
                  className="px-4 py-1.5 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                >
                  {publishLabel}
                </button>
              )}
              <button onClick={onClose} aria-label="Close" className="p-1 text-[var(--text-faint)] hover:text-[var(--text)]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border)]">
              {/* Left: metadata + key */}
              <div className="p-6 space-y-5">
                <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Details</h4>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1.5">Display name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={sg.slug.split('/').pop()}
                      className={cn(
                        'w-full px-3 py-2 text-sm rounded-[var(--radius-button)]',
                        'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                        'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                      )}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[var(--text-muted)] mb-1.5">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this subgraph index?"
                      rows={3}
                      className={cn(
                        'w-full px-3 py-2 text-sm rounded-[var(--radius-button)] resize-none',
                        'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                        'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
                      )}
                    />
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : saveOk ? 'Saved ✓' : 'Save'}
                  </button>
                </div>

                {sg.deployment_id && (
                  <div className="pt-4 border-t border-[var(--border)] space-y-1.5">
                    <p className="text-xs text-[var(--text-muted)]">Deployment ID</p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-mono text-[var(--text-faint)] truncate flex-1">
                        {sg.deployment_id}
                      </code>
                      <CopyButton text={sg.deployment_id} />
                    </div>
                    <Link
                      href={`/subgraphs/${sg.deployment_id}`}
                      className="text-xs text-[var(--accent-text)] hover:underline"
                    >
                      View indexing status →
                    </Link>
                  </div>
                )}

                {activeBounties && activeBounties.length > 0 && (
                  <div className="pt-4 border-t border-[var(--border)] space-y-2">
                    <p className="text-xs font-medium text-amber-400">Active Bounties</p>
                    {activeBounties.map((b) => (
                      <div key={b.id} className="rounded-[var(--radius)] bg-amber-500/10 border border-amber-500/20 px-3 py-2 space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-amber-300">{b.amount_grt} GRT</span>
                          {b.chain_bounty_id && (
                            <span className="text-xs text-[var(--text-faint)] font-mono">#{b.chain_bounty_id}</span>
                          )}
                        </div>
                        {b.message && <p className="text-xs text-[var(--text-muted)] italic">&quot;{b.message}&quot;</p>}
                        {b.expires_at && (
                          <p className="text-xs text-[var(--text-faint)]">
                            expires {new Date(b.expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 border-t border-[var(--border)]">
                  <DeployKeyPanel />
                </div>

                {nftIdError && (
                  <p className="pt-4 text-xs text-[var(--red-text)]">
                    The on-chain subgraph id was resolved but could not be saved ({nftIdError}), so
                    the lifecycle actions below stay hidden. Reopening this subgraph will try again.
                  </p>
                )}

                <SubgraphLifecyclePanel
                  sg={sg}
                  displayName={displayName}
                  description={description}
                  onUpdated={(updated) => {
                    setSg(updated);
                    onUpdated(updated);
                  }}
                />

                <div className="pt-4 border-t border-[var(--border)]">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] bg-[var(--red)] text-white hover:opacity-80 transition-opacity disabled:opacity-50"
                  >
                    {deleting ? 'Removing...' : 'Remove subgraph'}
                  </button>
                  {deleteError && (
                    <p className="mt-2 text-xs text-[var(--red-text)]">
                      {deleteError}. The subgraph is still here.
                    </p>
                  )}
                </div>
              </div>

              {/* Right: getting started */}
              <div className="p-6 space-y-5">
                <h4 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                  Getting Started
                </h4>

                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">1. Install graph-cli</p>
                  <CodeBlock>npm install -g @graphprotocol/graph-cli</CodeBlock>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">2. Build</p>
                  <CodeBlock>graph codegen && graph build</CodeBlock>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">3. Deploy</p>
                  <CodeBlock>{`graph deploy \\\n  --node ${NODE_URL} \\\n  --deploy-key <YOUR_DEPLOY_KEY> \\\n  --ipfs https://api.thegraph.com/ipfs \\\n  ${sg.slug}`}</CodeBlock>
                </div>
                <div className="pt-2 border-t border-[var(--border)]">
                  <p className="text-xs text-[var(--text-muted)] mb-1">4. Publish on-chain</p>
                  <p className="text-xs text-[var(--text-faint)]">
                    {!sg.deployment_id
                      ? 'Deploy first, then click Publish to make your subgraph discoverable on The Graph Network.'
                      : isPublished
                      ? hasNewDeployment
                        ? 'New deployment detected. Click Update Version above to publish it on-chain.'
                        : 'Published ✓. Update your code, run graph deploy again (step 3), then click Update Version above.'
                      : 'Click the Publish button above to list your subgraph on The Graph Network.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPublish && (
        <PublishWizard
          sg={sg}
          onClose={() => setShowPublish(false)}
          onPublished={handlePublished}
        />
      )}
    </>
  );
}