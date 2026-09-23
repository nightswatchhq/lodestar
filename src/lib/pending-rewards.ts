import type { ActiveAllocation } from '@/lib/contracts/indexer-detail';

export type AccruedTotal =
  | { kind: 'unavailable' }
  | { kind: 'ready'; wei: bigint; unread: number };

export const ACCRUED_TOOLTIP =
  'What a POI would collect now, before cuts. A denied deployment, or an indexer the REO marks ineligible, collects none of it.';

/** Wei as a bigint, or null for a row that was not read. */
export function accruedWei(value: string | null | undefined): bigint | null {
  if (value == null) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * The sum over open allocations. Unavailable when kittiwake sent no reading, which is what an older
 * kittiwake or a failed chain read looks like, so that it never reads as zero waiting.
 */
export function accruedTotal(allocations: ActiveAllocation[] | undefined): AccruedTotal {
  if (!allocations) return { kind: 'unavailable' };
  if (allocations.some((a) => a.pendingRewards === undefined)) return { kind: 'unavailable' };
  let wei = 0n;
  let unread = 0;
  for (const a of allocations) {
    const v = accruedWei(a.pendingRewards);
    if (v == null) unread += 1;
    else wei += v;
  }
  if (allocations.length > 0 && unread === allocations.length) return { kind: 'unavailable' };
  return { kind: 'ready', wei, unread };
}
