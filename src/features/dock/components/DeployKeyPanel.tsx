'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CopyButton } from '@/components/ui/CopyButton';
import { useDeployKey, useRotateDeployKey } from '../api';
import { isUnavailable, unavailableReason, useQueryState } from '@/hooks/useQueryState';
import { useDialog } from '@/hooks/useDialog';

export function DeployKeyPanel() {
  const [plainKey, setPlainKey] = useState<string | null>(null);

  const { confirm, dialog } = useDialog();
  const key = useQueryState(useDeployKey());
  const rotate = useRotateDeployKey();
  const keyInfo = key.kind === 'ready' ? key.data : null;
  const loading = rotate.isPending;

  const generate = async () => {
    if (
      keyInfo?.hasKey &&
      !(await confirm('Your existing deploy key stops working immediately, and anything using it will start failing.', {
        title: 'Replace the deploy key?',
        confirmLabel: 'Replace it',
        danger: true,
      }))
    ) {
      return;
    }
    // The key is in clear exactly once, in this response, and the server keeps only a hash. It
    // goes to local state rather than the query cache for that reason: a refetch would replace the
    // only copy anybody has with `{ hasKey: true }`.
    const data = await rotate.mutateAsync();
    if (data.key) setPlainKey(data.key);
  };

  return (
    <div className="space-y-2">
      {dialog}
      <p className="text-xs font-medium text-[var(--text-muted)]">Deploy Key</p>
      {plainKey ? (
        <div>
          <p className="text-xs text-amber-500 mb-2">Save this now; it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2 p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)]">
            <code className="flex-1 text-xs font-mono text-[var(--text)] break-all">{plainKey}</code>
            <CopyButton text={plainKey} />
          </div>
        </div>
      ) : keyInfo?.hasKey ? (
        <div className="p-3 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border)] overflow-hidden">
          <code className="block text-xs font-mono text-[var(--text-faint)] truncate">{'•'.repeat(64)}</code>
        </div>
      ) : isUnavailable(key) ? (
        <p className="text-xs text-[var(--text-muted)]">{unavailableReason(key)}</p>
      ) : key.kind !== 'ready' ? (
        <p className="text-xs text-[var(--text-faint)]">Checking…</p>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">No deploy key yet.</p>
      )}
      <button
        onClick={generate}
        disabled={loading}
        className={cn(
          'w-full px-3 py-1.5 text-xs font-medium rounded-[var(--radius-button)] transition-opacity disabled:opacity-50',
          keyInfo?.hasKey
            ? 'border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
            : 'bg-[var(--accent)] text-white hover:opacity-90',
        )}
      >
        {loading ? 'Generating...' : keyInfo?.hasKey ? 'Regenerate Key' : 'Generate Deploy Key'}
      </button>
      {keyInfo?.lastUsedAt && (
        <p className="text-xs text-[var(--text-faint)]">
          Last used: {new Date(keyInfo.lastUsedAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}