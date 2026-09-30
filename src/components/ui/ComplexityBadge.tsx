import { Badge } from '@/components/ui/Badge';
import type { ComplexityCategory } from '@/lib/manifest';
import type { DifficultyFields, SyncSpeed } from '@/lib/api';

// The manifest score cannot see event volume or eth_calls per event, so a "Light" subgraph can sync
// for weeks. Where kittiwake has seen indexers syncing it, the measured label wins (lodestar#319).
export const COMPLEXITY_ESTIMATE_TIP =
  'Estimated from the manifest (handler counts, block handlers, start block), not measured sync speed. ' +
  'Event volume and eth_calls per event are not counted.';

export const DIFFICULTY_TIP =
  'Measured from indexers seen syncing the deployment: under a day is Light, a week Moderate, a month Heavy. ' +
  'Where nobody has been seen syncing it, estimated from the manifest (*).';

export const COMPLEXITY_VARIANT: Record<ComplexityCategory, 'success' | 'default' | 'warning' | 'error'> = {
  Light: 'success',
  Moderate: 'default',
  Heavy: 'warning',
  Extreme: 'error',
};

/** "about 48 days" or "never catches up", the one figure an allocator wants. */
export function syncTimeText(s: SyncSpeed): string {
  if (s.daysToSync === null) return 'never catches up at this speed';
  // Barely faster than the chain extrapolates to decades, which reads as a bug rather than a warning.
  if (s.daysToSync > 365) return 'over a year';
  if (s.daysToSync < 1) return `about ${Math.max(1, Math.round(s.daysToSync * 24))} hours`;
  return `about ${Math.round(s.daysToSync)} days`;
}

export function syncSpeedTip(s: SyncSpeed): string {
  const n = s.indexers === 1 ? '1 indexer' : `${s.indexers} indexers`;
  const date = new Date(s.measuredAt * 1000).toISOString().slice(0, 10);
  return (
    `Measured: ${n} syncing at ${s.blocksPerHour.toLocaleString()} blocks/h, the chain at ` +
    `${s.chainBlocksPerHour.toLocaleString()}. A full sync from the start block: ${syncTimeText(s)}. As of ${date}.`
  );
}

export function ComplexityBadge({
  complexity,
  difficulty,
  difficultySource,
  syncSpeed,
}: { complexity: ComplexityCategory | null } & DifficultyFields) {
  if (difficultySource === 'measured' && difficulty && syncSpeed) {
    return (
      <Badge variant={COMPLEXITY_VARIANT[difficulty]} title={syncSpeedTip(syncSpeed)}>
        {difficulty}
        <span className="sr-only"> (measured)</span>
      </Badge>
    );
  }
  if (!complexity) return <span className="text-[var(--text-faint)]">--</span>;
  return (
    <Badge variant={COMPLEXITY_VARIANT[complexity]} title={COMPLEXITY_ESTIMATE_TIP}>
      {complexity}
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (estimate)</span>
    </Badge>
  );
}
