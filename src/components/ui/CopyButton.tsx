'use client';

import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/utils';

/**
 * The copy control for the places that genuinely look the same.
 *
 * Two variants because two shapes existed in the codebase and both are right for where they are: a
 * bare icon beside a truncated hash, and a labelled button under a code block. Anything wanting a
 * third appearance should use `useCopyToClipboard` and write its own markup rather than adding a
 * variant here.
 *
 * A failed copy says so. The versions this replaces either reported success regardless or showed
 * nothing at all, and "Copied!" when nothing was copied is the worse of the two.
 */
export function CopyButton({
  text,
  variant = 'label',
  title = 'Copy',
  className,
}: {
  text: string;
  variant?: 'label' | 'icon';
  title?: string;
  className?: string;
}) {
  const { copy, copied, failed } = useCopyToClipboard();

  if (variant === 'icon') {
    return (
      <button
        onClick={() => void copy(text)}
        title={failed ? 'Could not copy' : copied ? 'Copied' : title}
        aria-label={title}
        className={cn(
          'flex-shrink-0 transition-colors',
          failed ? 'text-[var(--red-text)]' : 'text-[var(--accent-text)] hover:text-[var(--text)]',
          className,
        )}
      >
        {copied ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={() => void copy(text)}
      className={cn(
        'px-2 py-1 text-xs rounded transition-colors',
        'bg-[var(--bg-elevated)] hover:bg-[var(--border)] text-[var(--text-muted)]',
        className,
      )}
    >
      {failed ? 'Copy failed' : copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
