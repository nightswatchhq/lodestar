'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Anchor = { top: number; bottom: number; centre: number };

const AnchorContext = createContext<Anchor | null>(null);

const GAP_PX = 6;
const MARGIN_PX = 8;

/**
 * A hover tooltip drawn in a portal at fixed coordinates. Positioned inside its row, it was clipped by
 * the table's `overflow-x-auto` wrapper, because overflow on one axis clips the other too: on the top
 * rows of the indexer directory the tooltip was cut off under the header.
 */
export function HoverTip({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const hide = () => setAnchor(null);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [anchor]);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.top, bottom: r.bottom, centre: r.left + r.width / 2 });
  };

  return (
    <span ref={ref} className={cn('relative', className)} onMouseEnter={show} onMouseLeave={() => setAnchor(null)}>
      <AnchorContext.Provider value={anchor}>{children}</AnchorContext.Provider>
    </span>
  );
}

/** Opens below the trigger, or above it when there is no room below. */
export function HoverTipContent({ width, className, children }: { width: number; className?: string; children: ReactNode }) {
  const anchor = useContext(AnchorContext);
  const ref = useRef<HTMLSpanElement>(null);
  const [above, setAbove] = useState(false);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const height = ref.current.offsetHeight;
    const fitsBelow = anchor.bottom + GAP_PX + height <= window.innerHeight - MARGIN_PX;
    setAbove(!fitsBelow && anchor.top - GAP_PX - height >= MARGIN_PX);
  }, [anchor]);

  if (!anchor) return null;
  const left = Math.min(Math.max(MARGIN_PX, anchor.centre - width / 2), window.innerWidth - width - MARGIN_PX);

  return createPortal(
    <span
      ref={ref}
      role="tooltip"
      style={{
        position: 'fixed',
        left,
        width,
        top: above ? anchor.top - GAP_PX : anchor.bottom + GAP_PX,
        transform: above ? 'translateY(-100%)' : undefined,
      }}
      className={cn(
        'z-[100] block p-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] shadow-xl pointer-events-none',
        'text-left text-[11px] font-normal normal-case tracking-normal whitespace-normal text-[var(--text)]',
        className,
      )}
    >
      {children}
    </span>,
    document.body,
  );
}
