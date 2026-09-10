'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SubgraphCard } from './SubgraphCard';
import { RegisterModal } from './RegisterModal';
import { SubgraphDetailModal } from './SubgraphDetailModal';
import { dockKeys, useMySubgraphs } from '../api';
import { isUnavailable, unavailableReason, useQueryState } from '@/hooks/useQueryState';
import type { StudioSubgraph } from '../types';

export function MySubgraphsTab({ sessionAddress }: { sessionAddress: string }) {
  const qc = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [activeSubgraph, setActiveSubgraph] = useState<StudioSubgraph | null>(null);

  const query = useQueryState(useMySubgraphs());
  const subgraphs = query.kind === 'ready' ? query.data : [];

  const handleCreated = (sg: StudioSubgraph) => {
    // `useCreateSubgraph` already invalidates the list; this keeps the new row on screen without
    // waiting for the refetch to land.
    qc.setQueryData(dockKeys.subgraphs, (old: StudioSubgraph[] | undefined) => [sg, ...(old ?? [])]);
  };

  const handleUpdated = (sg: StudioSubgraph) => {
    qc.setQueryData(dockKeys.subgraphs, (old: StudioSubgraph[] | undefined) =>
      (old ?? []).map((s) => (s.id === sg.id ? sg : s)),
    );
  };

  const handleDeleted = (id: number) => {
    qc.setQueryData(dockKeys.subgraphs, (old: StudioSubgraph[] | undefined) =>
      (old ?? []).filter((s) => s.id !== id),
    );
  };

  const handlePublished = (id: number, txHash: string) => {
    qc.setQueryData(dockKeys.subgraphs, (old: StudioSubgraph[] | undefined) =>
      (old ?? []).map((s) => (s.id === id ? { ...s, published_subgraph_id: txHash } : s)),
    );
    setActiveSubgraph((prev) =>
      prev?.id === id ? { ...prev, published_subgraph_id: txHash } : prev,
    );
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-[var(--text-muted)]">
            {subgraphs.length} subgraph{subgraphs.length !== 1 ? 's' : ''}
          </h2>
          <button
            onClick={() => setShowRegister(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Subgraph
          </button>
        </div>

        {/* "No subgraphs yet" is a claim about this account, so it waits for an answer. A failed
            or paused read used to fall straight through to it. */}
        {isUnavailable(query) ? (
          <p className="text-sm text-[var(--text-muted)] py-8 text-center">
            {unavailableReason(query)}
          </p>
        ) : query.kind !== 'ready' ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-lg shimmer" />
            ))}
          </div>
        ) : subgraphs.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center gap-4 border border-dashed border-[var(--border)] rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-dim)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div>
              <p className="text-[var(--text)] font-medium">No subgraphs yet</p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Create a subgraph to get your deploy endpoint and key.
              </p>
            </div>
            <button
              onClick={() => setShowRegister(true)}
              className="px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            >
              Create your first subgraph
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {subgraphs.map((sg) => (
              <SubgraphCard key={sg.id} sg={sg} onClick={() => setActiveSubgraph(sg)} />
            ))}
          </div>
        )}
      </div>

      {showRegister && (
        <RegisterModal onClose={() => setShowRegister(false)} onCreated={handleCreated} />
      )}

      {activeSubgraph && (
        <SubgraphDetailModal
          sg={activeSubgraph}
          sessionAddress={sessionAddress}
          onClose={() => setActiveSubgraph(null)}
          onUpdated={handleUpdated}
          onPublished={handlePublished}
          onDelete={handleDeleted}
        />
      )}
    </>
  );
}