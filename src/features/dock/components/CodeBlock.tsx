'use client';

import { CopyButton } from '@/components/ui/CopyButton';

export function CodeBlock({ children }: { children: string }) {
  return (
    <div className="mt-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] overflow-hidden">
      <pre className="px-3 pt-3 pb-2 text-xs font-mono text-[var(--text)] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {children}
      </pre>
      <div className="flex justify-end px-2 pb-2">
        <CopyButton text={children} />
      </div>
    </div>
  );
}