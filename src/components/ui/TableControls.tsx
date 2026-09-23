'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { isColumnVisible, toggleColumn, type ColumnSpec, type Density } from '@/lib/table-prefs';

/** The column picker and density toggle a big table carries in its toolbar. */
export function TableControls({
  specs,
  columns,
  onColumnsChange,
  density,
  onDensityChange,
  className,
}: {
  specs: readonly ColumnSpec[];
  columns: Record<string, boolean>;
  onColumnsChange: (columns: Record<string, boolean>) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shown = specs.filter((s) => isColumnVisible(s, columns)).length;
  const touched = specs.some((s) => columns[s.id] !== undefined);
  const button = 'px-2.5 py-1.5 text-xs rounded-[var(--radius-button)] border border-[var(--border)] transition-colors';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((o) => !o)}
          className={cn(button, 'text-[var(--text-muted)] hover:text-[var(--text)]')}
        >
          Columns <span className="font-mono text-[var(--text-faint)]">{shown}/{specs.length}</span>
        </button>
        {open ? (
          <div className="absolute right-0 top-full mt-1 z-30 w-52 p-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] shadow-lg">
            <ul className="max-h-80 overflow-y-auto">
              {specs.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 px-1.5 py-1 text-xs text-[var(--text)] rounded hover:bg-[var(--bg-elevated)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isColumnVisible(s, columns)}
                      onChange={() => onColumnsChange(toggleColumn(s, columns))}
                      className="accent-[var(--accent)]"
                    />
                    {s.label}
                  </label>
                </li>
              ))}
            </ul>
            {touched ? (
              <button
                type="button"
                onClick={() => onColumnsChange({})}
                className="mt-1 w-full px-1.5 py-1 text-left text-xs text-[var(--text-faint)] hover:text-[var(--text)]"
              >
                Reset to default
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="inline-flex rounded-[var(--radius-button)] border border-[var(--border)] p-0.5" role="group" aria-label="Row density">
        {(['comfortable', 'compact'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={density === d}
            onClick={() => onDensityChange(d)}
            className={cn(
              'px-2 py-1 text-xs capitalize rounded-[var(--radius-button)]',
              density === d ? 'bg-[var(--bg-elevated)] text-[var(--text)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]',
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
