'use client';

import { useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A dialog that is part of the page rather than part of the browser.
 *
 * The Dock used `window.confirm` and `window.alert` for six decisions. In a browser those are
 * merely ugly; inside the iOS shell Capacitor renders them as native alerts titled with the
 * origin, so "www.lodestar-dashboard.com says" appears above a question about deleting a subgraph
 * or spending GRT. That reads as a phishing prompt, and it is the one place the app most needs to
 * look like itself.
 *
 * Focus is moved into the panel on open and returned to whatever had it on close, because a modal
 * that leaves focus behind it is one a keyboard or screen-reader user cannot reach.
 */
export function Modal({
  title,
  onClose,
  canClose = true,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  /** False while something irreversible is in flight, so a stray Escape cannot abandon it. */
  canClose?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (canClose) onClose();
  }, [canClose, onClose]);

  useEffect(() => {
    // Captured now rather than read in the cleanup: by the time cleanup runs React has already
    // detached the node and `panel.current` is null, so the containment check would never pass and
    // focus would never come back.
    const node = panel.current;
    const previous = document.activeElement;
    node?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      // Only if focus is still inside the panel: something else may have deliberately taken it.
      if (previous instanceof HTMLElement && node?.contains(document.activeElement)) {
        previous.focus();
      }
    };
  }, [close]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      // A click on the backdrop, not on a child that happens to bubble up to it.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl outline-none',
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] p-5">
          <h3 className="font-semibold text-[var(--text)]">{title}</h3>
          {canClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
