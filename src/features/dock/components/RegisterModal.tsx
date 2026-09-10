'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useCreateSubgraph } from '../api';
import type { StudioSubgraph } from '../types';

export function RegisterModal({ onClose, onCreated }: { onClose: () => void; onCreated: (sg: StudioSubgraph) => void }) {
  const createSubgraph = useCreateSubgraph();
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await createSubgraph.mutateAsync({
        slug: slug.trim().toLowerCase(),
        displayName: displayName.trim() || undefined,
      });
      onCreated(data.subgraph);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md bg-[var(--bg-surface)] rounded-xl border border-[var(--border)] shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h3 className="font-semibold text-[var(--text)]">Create Subgraph</h3>
          <button onClick={onClose} aria-label="Close" className="text-[var(--text-faint)] hover:text-[var(--text)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">
              Slug <span className="text-[var(--red-text)]">*</span>
            </label>
            <input
              type="text"
              placeholder="org/my-subgraph"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className={cn(
                'w-full px-3 py-2 text-sm font-mono rounded-[var(--radius-button)]',
                'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
              )}
            />
            <p className="text-xs text-[var(--text-faint)] mt-1">
              e.g. <code>acme/uniswap-v3</code>
            </p>
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1.5">Display name (optional)</label>
            <input
              type="text"
              placeholder="Uniswap V3 on Base"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-[var(--radius-button)]',
                'bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text)]',
                'placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]',
              )}
            />
          </div>
          {error && <p className="text-xs text-[var(--red-text)]">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm rounded-[var(--radius-button)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}