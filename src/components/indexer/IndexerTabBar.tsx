'use client';

import { cn } from '@/lib/utils';
import { INDEXER_TAB_LABELS, type IndexerTab } from '@/lib/indexer-tabs';

export function IndexerTabBar({
  active,
  onSelect,
  labels,
}: {
  active: IndexerTab;
  onSelect: (tab: IndexerTab) => void;
  /** Labels that carry a figure, such as the delegator count. */
  labels?: Partial<Record<IndexerTab, string>>;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-[var(--border)] overflow-x-auto">
      {INDEXER_TAB_LABELS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onSelect(tab.id)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
            active === tab.id
              ? 'border-[var(--accent)] text-[var(--accent-text)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
          )}
        >
          {labels?.[tab.id] ?? tab.label}
        </button>
      ))}
    </div>
  );
}
