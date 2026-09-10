'use client';

import { useDismissible } from '@/hooks/useDismissible';

// New key (not the retired Redstart one) so this shows to everyone, including
// people who dismissed the previous banner.
const STORAGE_KEY = 'lodestar:nuthatch-banner-dismissed';
const SITE_URL = 'https://www.nuthatch-indexer.com/?utm_source=lodestar&utm_medium=banner';

// Nuthatch's slate-blue and terracotta.
const SLATE = '#8bb8dc';
const RUST = '#cd8560';
// RUST as type on this banner's tinted background is 4.14:1. Same hue lifted
// far enough to clear 4.5:1, used only for the second wordmark.
const RUST_TEXT = '#d89a76';
// The accent is light, so the button carries dark type rather than white:
// white on SLATE is 2.10:1, this ink is 7.79:1.
const INK = '#12212e';
const SLATE_BRIGHT = '#cfe3f2';

export function NuthatchBanner() {
  const { dismissed, dismiss } = useDismissible(STORAGE_KEY);

  if (dismissed) return null;

  return (
    <div
      className="mb-4 md:mb-6 flex items-center gap-3 rounded-[var(--radius-card)] px-4 py-2.5 border"
      style={{
        background: `color-mix(in srgb, ${SLATE} 12%, var(--bg-surface))`,
        borderColor: `color-mix(in srgb, ${SLATE} 45%, transparent)`,
      }}
    >
      <span
        className="hidden sm:inline-flex items-center justify-center w-6 h-6 rounded-[var(--radius-button)] shrink-0"
        style={{ background: `linear-gradient(135deg, ${SLATE}, ${RUST})` }}
        aria-hidden="true"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={INK}>
          <ellipse cx="12" cy="5.5" rx="8" ry="3.5" />
          <path d="M4 9v4c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5V9c0 1.93-3.58 3.5-8 3.5S4 10.93 4 9z" />
          <path d="M4 16v3c0 1.93 3.58 3.5 8 3.5s8-1.57 8-3.5v-3c0 1.93-3.58 3.5-8 3.5s-8-1.57-8-3.5z" />
        </svg>
      </span>

      <p className="flex-1 min-w-0 text-[12px] md:text-[13px] text-[var(--text)]">
        <span className="font-semibold" style={{ color: SLATE }}>
          Nuthatch
        </span>{' '}
        turns any contract into a local{' '}
        <span className="font-semibold" style={{ color: RUST_TEXT }}>
          SQL database
        </span>
        . One command, one tiny binary, no subgraph to author.{' '}
        <span className="text-[var(--text-muted)]">Your box, your data.</span>
      </p>

      <a
        href={SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        // Brightens on hover, which raises the ink contrast rather than
        // lowering it: 7.79:1 at rest, 12.41:1 on SLATE_BRIGHT.
        onMouseEnter={(e) => (e.currentTarget.style.background = SLATE_BRIGHT)}
        onMouseLeave={(e) => (e.currentTarget.style.background = SLATE)}
        className="shrink-0 px-3 py-1 text-[12px] font-medium rounded-[var(--radius-button)] transition-colors active:scale-[0.97]"
        style={{ background: SLATE, color: INK }}
      >
        Index a contract →
      </a>

      <button
        onClick={dismiss}
        className="shrink-0 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors text-lg leading-none -mr-0.5"
        aria-label="Dismiss Nuthatch banner"
      >
        &times;
      </button>
    </div>
  );
}
