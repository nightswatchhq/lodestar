'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { downloadCsv } from '@/lib/csv';

interface ExportButtonProps {
  /** May be async, for an export that has to fetch more than the page holds. */
  onExport: () => string | Promise<string>;
  filename: string;
  label?: string;
  disabled?: boolean;
  title?: string;
  /** Toolbar size, to sit beside the small filter controls of a table. */
  compact?: boolean;
}

export function ExportButton({
  onExport,
  filename,
  label = 'Export CSV',
  disabled = false,
  title,
  compact = false,
}: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleExport = async () => {
    if (disabled || exporting) return;

    setExporting(true);
    setFailed(false);
    try {
      downloadCsv(filename, await onExport());
    } catch (error) {
      console.error('Export failed:', error);
      setFailed(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      title={failed ? 'The export could not be completed. Try again.' : title}
      disabled={disabled || exporting}
      className={cn(
        'inline-flex items-center font-medium',
        compact ? 'gap-1.5 px-2.5 py-1.5 text-xs' : 'gap-2 px-3 py-2 text-sm',
        'rounded-[var(--radius-button)] border border-[var(--border)]',
        'transition-colors',
        disabled || exporting
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-[var(--accent-hover)] hover:bg-[var(--bg-elevated)]'
      )}
    >
      {exporting ? (
        <div className={cn(compact ? 'w-3 h-3' : 'w-4 h-4', 'border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin')} />
      ) : (
        <svg
          className={cn(compact ? 'w-3 h-3' : 'w-4 h-4', 'text-[var(--text-muted)]')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
      )}
      <span className="text-[var(--text)]">{failed ? 'Export failed' : label}</span>
    </button>
  );
}
