import { timingSafeMatch } from './secret-auth';

/**
 * Authorize a cron/internal request against CRON_SECRET.
 *
 * - **Fails closed**: if CRON_SECRET is unset, ALWAYS returns false (never allow
 *   an unauthenticated caller through just because the secret is missing).
 * - **Timing-safe**: compares the Authorization header with constant-time
 *   comparison so the secret can't be recovered via response-timing analysis.
 *
 * Accepts the standard `Authorization: Bearer <secret>` header.
 */
export function isCronAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false; // fail closed

  return timingSafeMatch(req.headers.get('authorization'), `Bearer ${cronSecret}`);
}
