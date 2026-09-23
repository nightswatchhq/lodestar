'use client';

import { useWatchlist } from '@/hooks/useWatchlist';
import type { WatchKind } from '@/lib/watchlist';
import { cn } from '@/lib/utils';

/** A star that adds an indexer or deployment to the watchlist, or takes it off. */
export function WatchStar({
  kind,
  id,
  size = 'sm',
  className,
}: {
  kind: WatchKind;
  id: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { watched, toggle } = useWatchlist();
  const on = watched(kind, id);
  const noun = kind === 'indexer' ? 'indexer' : 'subgraph';
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${noun} from watchlist` : `Add ${noun} to watchlist`}
      title={on ? 'On your watchlist' : 'Add to watchlist'}
      onClick={(e) => {
        // Rows and cards around a star navigate on click.
        e.preventDefault();
        e.stopPropagation();
        toggle(kind, id);
      }}
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded transition-colors',
        size === 'md' ? 'w-8 h-8' : 'w-5 h-5',
        on ? 'text-[var(--amber)]' : 'text-[var(--text-faint)] hover:text-[var(--text)]',
        className,
      )}
    >
      <svg
        className={size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5'}
        viewBox="0 0 24 24"
        fill={on ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path strokeLinejoin="round" d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z" />
      </svg>
    </button>
  );
}
