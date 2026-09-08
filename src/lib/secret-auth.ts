import { timingSafeEqual } from 'crypto';

/**
 * Constant-time comparison of a caller-supplied header against an expected value.
 *
 * `timingSafeEqual` requires equal-length buffers, so a length mismatch is an early reject. The
 * length of the expected value is not itself a secret, so that leak is acceptable and the
 * alternative (padding) is not worth the complexity.
 *
 * Shared by every shared-secret guard in the app so the fail-closed and timing-safe behaviour is
 * written once rather than remembered twenty-one times. See `cron-auth.ts` and `analytics-auth.ts`.
 */
export function timingSafeMatch(provided: string | null | undefined, expected: string): boolean {
  const a = Buffer.from(provided ?? '');
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
