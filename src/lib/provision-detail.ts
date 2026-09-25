import { formatPPM } from '@/lib/utils';
import type {
  DelegationFeeCuts,
  ParamRange,
  ProvisionActivityKind,
  ThawRequest,
} from '@/lib/queries';

/** ProvisionManager's "no maximum": a data service that sets no upper bound reports 2^64 - 1. */
export const U64_MAX = '18446744073709551615';

export function ppmLabel(ppm: number | string | null | undefined): string | null {
  if (ppm === null || ppm === undefined || ppm === '') return null;
  const n = Number(ppm);
  return Number.isFinite(n) ? formatPPM(n) : null;
}

export function periodLabel(seconds: number | string | null | undefined): string | null {
  if (seconds === null || seconds === undefined || seconds === '') return null;
  if (String(seconds) === U64_MAX) return 'no limit';
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return null;
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3_600);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${Math.floor(s / 60)}m`;
}

export function rangeLabel(
  range: ParamRange | null,
  format: (v: string) => string | null,
): string | null {
  if (!range) return null;
  const min = format(range.min);
  if (min === null) return null;
  if (range.max === U64_MAX) return `${min} or more`;
  const max = format(range.max);
  if (max === null) return null;
  return min === max ? min : `${min} to ${max}`;
}

export type ThawState =
  | { kind: 'invalidated' }
  | { kind: 'ready' }
  | { kind: 'thawing'; secondsLeft: number }
  | { kind: 'unknown' };

export function thawState(req: ThawRequest, nowSec: number): ThawState {
  if (req.valid === false) return { kind: 'invalidated' };
  if (req.thawingUntil === null) return { kind: 'unknown' };
  const left = req.thawingUntil - nowSec;
  return left <= 0 ? { kind: 'ready' } : { kind: 'thawing', secondsLeft: left };
}

export const PAYMENT_TYPES: { key: keyof DelegationFeeCuts; id: number; label: string }[] = [
  { key: 'queryFee', id: 0, label: 'Query fees' },
  { key: 'indexingFee', id: 1, label: 'Indexing fees' },
  { key: 'indexingRewards', id: 2, label: 'Indexing rewards' },
];

export function paymentTypeLabel(id: number | null): string {
  return PAYMENT_TYPES.find((p) => p.id === id)?.label ?? `Payment type ${id ?? '?'}`;
}

export const ACTIVITY_LABEL: Record<ProvisionActivityKind, string> = {
  ProvisionCreated: 'Provisioned',
  ProvisionIncreased: 'Added',
  ProvisionThawed: 'Thaw started',
  TokensDeprovisioned: 'Deprovisioned',
  ProvisionSlashed: 'Slashed',
  ThawRequestCreated: 'Thaw request',
  ThawRequestFulfilled: 'Thaw fulfilled',
  DelegationFeeCutSet: 'Fee cut set',
};

/**
 * Whether the index lists fewer or more pending requests than HorizonStaking does. Null when the
 * chain was not read, because then there is nothing to compare against.
 */
export function thawListDisagrees(chainCount: number | null, listed: number): boolean | null {
  return chainCount === null ? null : chainCount !== listed;
}
