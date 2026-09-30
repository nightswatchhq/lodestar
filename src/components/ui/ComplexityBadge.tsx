import { Badge } from '@/components/ui/Badge';
import type { ComplexityCategory } from '@/lib/manifest';

// The label is scored from the manifest alone (handlers, block handlers, start block), never from how
// fast indexers actually sync the deployment. A "Light" subgraph with heavy event volume or many
// eth_calls per event is anything but light, so the badge says it is an estimate. See lodestar#319.
export const COMPLEXITY_ESTIMATE_TIP =
  'Estimated from the manifest (handler counts, block handlers, start block), not measured sync speed. ' +
  'Event volume and eth_calls per event are not counted.';

export const COMPLEXITY_VARIANT: Record<ComplexityCategory, 'success' | 'default' | 'warning' | 'error'> = {
  Light: 'success',
  Moderate: 'default',
  Heavy: 'warning',
  Extreme: 'error',
};

export function ComplexityBadge({ complexity }: { complexity: ComplexityCategory | null }) {
  if (!complexity) return <span className="text-[var(--text-faint)]">--</span>;
  return (
    <Badge variant={COMPLEXITY_VARIANT[complexity]} title={COMPLEXITY_ESTIMATE_TIP}>
      {complexity}
      <span aria-hidden="true">*</span>
      <span className="sr-only"> (estimate)</span>
    </Badge>
  );
}
