'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SortHeaderProps<K extends string> {
  label: ReactNode;
  sortKey: K;
  sort: { key: K; dir: 'asc' | 'desc' } | null;
  onSort: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
  title?: string;
}

/** A table header that sorts by its column when clicked. */
export function SortHeader<K extends string>({ label, sortKey, sort, onSort, align = 'left', className, title }: SortHeaderProps<K>) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : null;
  return (
    <th
      scope="col"
      aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
      className={cn('px-4 py-2 text-[11px] font-medium text-[var(--text-muted)]', align === 'right' ? 'text-right' : 'text-left', className)}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 cursor-pointer select-none hover:text-[var(--text)]',
          active && 'text-[var(--text)]',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {label}
        <span aria-hidden="true" className={active ? 'text-[var(--accent-text)]' : 'text-[var(--text-faint)]'}>
          {dir === 'asc' ? '↑' : dir === 'desc' ? '↓' : '↕'}
        </span>
      </button>
    </th>
  );
}
