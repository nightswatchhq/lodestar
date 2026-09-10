'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Modal } from '@/components/ui/Modal';

/**
 * `window.confirm` and `window.alert`, as part of the page.
 *
 * Keeping the promise shape is deliberate: `if (!(await confirm(...))) return;` reads like the
 * line it replaces, so the call sites stay legible instead of turning into a two-phase state
 * machine each. What changes is the dialog, which in the iOS shell was a native alert titled with
 * the origin.
 *
 * **The promise always settles.** A dialog whose promise is dropped leaves its caller awaiting
 * forever, holding whatever it was holding; the unmount path resolves `false` rather than letting
 * that happen, and there is a test for it.
 */

interface Pending {
  kind: 'confirm' | 'notify';
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  settle: (ok: boolean) => void;
}

export function useDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  // The live promise's resolver, so unmount can settle it without going through render.
  const open = useRef<((ok: boolean) => void) | null>(null);

  useEffect(
    () => () => {
      open.current?.(false);
      open.current = null;
    },
    [],
  );

  const ask = useCallback(
    (kind: Pending['kind'], message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        // Settle at most once: the backdrop, Escape and the buttons can all fire, and a second
        // resolve would be silently ignored by the promise while leaving the dialog on screen.
        let done = false;
        const settle = (ok: boolean) => {
          if (done) return;
          done = true;
          open.current = null;
          setPending(null);
          resolve(ok);
        };
        open.current = settle;
        setPending({
          kind,
          title: opts?.title ?? (kind === 'confirm' ? 'Are you sure?' : 'Something went wrong'),
          message,
          confirmLabel: opts?.confirmLabel ?? 'Confirm',
          danger: opts?.danger ?? false,
          settle,
        });
      }),
    [],
  );

  const confirm = useCallback(
    (message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }) =>
      ask('confirm', message, opts),
    [ask],
  );

  /** For the places that used `alert`. Resolves when the reader dismisses it. */
  const notify = useCallback(
    (message: string, opts?: { title?: string }) => ask('notify', message, opts),
    [ask],
  );

  const dialog = pending ? (
    <Modal title={pending.title} onClose={() => pending.settle(false)}>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">{pending.message}</p>
      <div className="mt-5 flex justify-end gap-2">
        {pending.kind === 'confirm' && (
          <button
            onClick={() => pending.settle(false)}
            className="rounded-[var(--radius-button)] px-4 py-2 text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
          >
            Cancel
          </button>
        )}
        <button
          autoFocus
          onClick={() => pending.settle(true)}
          className={
            pending.danger
              ? 'rounded-[var(--radius-button)] bg-[var(--red)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80'
              : 'rounded-[var(--radius-button)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90'
          }
        >
          {pending.kind === 'confirm' ? pending.confirmLabel : 'OK'}
        </button>
      </div>
    </Modal>
  ) : null;

  return { confirm, notify, dialog };
}
