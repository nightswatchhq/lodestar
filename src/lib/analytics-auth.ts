import { timingSafeMatch } from './secret-auth';

/**
 * Authorize a request to the click-tracking analytics endpoints against ANALYTICS_SECRET.
 *
 * **Fails closed.** The previous guard read
 *
 * ```ts
 * if (secret && req.headers.get('x-analytics-secret') !== secret) { ...401 }
 * ```
 *
 * which skips the check entirely when the variable is unset - and it was unset in production, so
 * the check never ran (#113). A request with a deliberately wrong header returned the same 500 as
 * one with no header at all, which is how the absence went unnoticed: the permission error on
 * `clickthrough_events` was the only thing standing in front of an unauthenticated route that
 * serves wallet addresses tied to sessions and to referred dollar amounts.
 *
 * A secret that is absent must deny, not disable the check. Same rule and same shape as
 * `isCronAuthorized`.
 */
export function isAnalyticsAuthorized(req: { headers: { get(name: string): string | null } }): boolean {
  const secret = process.env.ANALYTICS_SECRET;
  if (!secret) return false; // fail closed

  return timingSafeMatch(req.headers.get('x-analytics-secret'), secret);
}
