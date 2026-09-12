/**
 * Where the API lives.
 *
 * ## Why this exists
 *
 * Every request used to be same-origin - `/api/…` - and `src/proxy.ts` forwarded the ones in
 * `MIGRATED` to kittiwake. That proxy is going, for reasons written up in
 * `docs/rfc-the-frontend-after-the-backend-left.md`: its rate limiter is per-edge-instance by its
 * own admission where kittiwake's is one governor on one box, and `LODESTAR_EDGE_SECRET` exists
 * only to let kittiwake believe an address the proxy forwards. Delete the proxy and both problems
 * go with it.
 *
 * What replaces it is the browser calling `api.lodestar-dashboard.com` itself, which needs the
 * origin written somewhere. This is that somewhere, and it is the only place.
 *
 * ## The default is the old behaviour
 *
 * Unset means the empty string means same-origin, which is exactly what the app did before. That
 * is deliberate: the origin change and the proxy deletion are separate deployments, each
 * revertable on its own. Shipping them together would leave no way back that was not a revert of
 * both.
 *
 * ## Two variables, not one
 *
 * `NEXT_PUBLIC_API_ORIGIN` is inlined into the browser bundle, which is what a client fetch needs.
 * `LODESTAR_API_ORIGIN` is server-only and is what the OpenGraph cards already read. Both are
 * checked so a server component and a client component cannot end up pointed at different hosts,
 * which would be a difference nobody would see until a preview card disagreed with its page.
 */

const RAW =
  process.env.NEXT_PUBLIC_API_ORIGIN?.trim() || process.env.LODESTAR_API_ORIGIN?.trim() || '';

/** No trailing slash, so `${API_ORIGIN}/api/x` never becomes `//api/x`. */
export const API_ORIGIN = RAW.replace(/\/+$/, '');

/**
 * An absolute URL for an API path, or the path unchanged when nothing is configured.
 *
 * Takes the path with its leading slash, so every call site still reads as the route it is asking
 * for and a `git grep '/api/poi'` still finds it. That matters more than it sounds: the route
 * inventory test and the one-typed-surface test both scan for exactly that literal.
 */
export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

/**
 * The same, for a fetch running on the server, where a relative URL is not a URL.
 *
 * `fallback` is the incoming request's own scheme and host, used only when no API origin is
 * configured. That keeps the old behaviour exactly: this page read `${proto}://${host}/api/…` so
 * that it went through the same edge rewrite as everything else, and clearing the switch rolled it
 * back with the rest rather than leaving it pointed at the backend on its own.
 */
export function serverApiUrl(path: string, fallback: { proto: string; host: string }): string {
  return API_ORIGIN ? `${API_ORIGIN}${path}` : `${fallback.proto}://${fallback.host}${path}`;
}
