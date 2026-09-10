'use client';

import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { StudioSubgraph } from '../types';

export function SubgraphCard({ sg, onClick }: { sg: StudioSubgraph; onClick: () => void }) {
  const isPublished = Boolean(sg.published_subgraph_id);
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--accent-hover)] hover:bg-[var(--bg-surface)] transition-all cursor-pointer"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--accent-dim)] flex items-center justify-center">
        <svg className="w-5 h-5 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm text-[var(--text)]">
            {sg.display_name || sg.slug.split('/').pop()}
          </span>
          <span className={cn(
            'text-xs px-2 py-0.5 rounded-full font-medium',
            isPublished
              ? 'bg-[var(--accent-dim)] text-[var(--accent-text)]'
              : 'bg-[var(--bg-surface)] text-[var(--text-faint)] border border-[var(--border)]',
          )}>
            {isPublished ? 'Published' : 'Draft'}
          </span>
          {sg.version_label && (
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-[var(--bg-elevated)] text-[var(--text-faint)] border border-[var(--border)]">
              {sg.version_label}
            </span>
          )}
          {sg.network && <Badge variant="default">{sg.network}</Badge>}
        </div>
        <p className="text-xs text-[var(--text-faint)] font-mono mt-0.5 truncate">{sg.slug}</p>
      </div>
      <svg className="w-4 h-4 text-[var(--text-faint)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}