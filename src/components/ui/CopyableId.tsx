'use client';

import { CopyButton } from '@/components/ui/CopyButton';
import { cn } from '@/lib/utils';

/**
 * A truncated id with the icon copy control beside it. Copies the full value.
 * Clicks stay on the button: these sit inside links and row handlers.
 */
export function CopyableId({
  value,
  title,
  display,
  className,
}: {
  value: string;
  title: string;
  display?: string;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 min-w-0', className)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="font-mono truncate" title={value}>
        {display ?? value}
      </span>
      <CopyButton text={value} variant="icon" title={title} />
    </span>
  );
}

export function truncatedQm(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}
