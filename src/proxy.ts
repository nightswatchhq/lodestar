import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

export const config = {
  matcher: '/api/:path*',
};

/**
 * The Rust backend, when we are pointing at it.
 *
 * **Unset means no rewrite happens at all**, and that is the switch. Setting `LODESTAR_API_ORIGIN`
 * in the Vercel project moves every route in `MIGRATED` to kittiwake; clearing it moves them back.
 * A rollback is therefore an environment change taking effect on the next request, rather than a
 * revert and a redeploy - which matters, because the moment you need one is the moment you least
 * want to be waiting on a build.
 */
const API_ORIGIN = process.env.LODESTAR_API_ORIGIN?.replace(/\/+$/, '');

/**
 * The secret that lets the backend believe our `X-Forwarded-For`.
 *
 * Without it, every visitor arrives at the backend wearing this edge's address and they all share
 * one rate-limit bucket. See nightswatchhq/kittiwake#21. The backend refuses to trust the header
 * unless this matches its own `edge_secret`, so a stranger calling `api.lodestar-dashboard.com`
 * directly cannot name themselves whoever they like.
 */
const EDGE_SECRET = process.env.LODESTAR_EDGE_SECRET;

/**
 * The routes kittiwake serves, as its own router lists them.
 *
 * Eight routes were taken out again on 7 September, having shipped with the wrong shape. Two are
 * back: `sql/catalog` and `indexer-stake-history`, both now agreeing with the old handler in the
 * parity harness. **Six remain out**: `indexing-status`, `subgraph-curation`, `subgraph-history`,
 * `grt-flow`, `rewards-history` and `apr-provenance`.
 *
 * Every one of the eight answered 200 with a payload the frontend could not read -
 * `subgraph-history` returned `{allocations, signals}` where the page reads `{history}`,
 * `indexer-stake-history` returned no `history` at all.
 *
 * None of the eight was in the parity harness, which is the whole reason they shipped. That gap is
 * now a test on the kittiwake side: nothing the service serves may go uncompared. They come back
 * here as their ports are finished and the harness agrees. See nightswatchhq/kittiwake#23.
 *
 * An explicit list rather than a prefix, because the two services split `/api` between them and
 * `/api/studio/*`, `/api/scuttlebutt/*` and the long tail are still here. Anything absent from this
 * list is served by Next as it always was.
 *
 * Kept in step by hand, which is the honest weakness of it: a route added to kittiwake and not to
 * this list stays on Next and nobody notices, because both answer. The parity harness is what
 * catches that, and `docs/status.md` in the kittiwake repo is what it writes.
 */
const MIGRATED: readonly string[] = [
  '/api/chain-lag',
  '/api/curators',
  '/api/delegation-events',
  '/api/delegation-flows',
  '/api/developer-activity',
  '/api/dips',
  '/api/dropped-chains',
  '/api/epochs',
  '/api/horizon/activity',
  '/api/indexer-node-health',
  '/api/indexer-status/',
  '/api/indexer/',
  '/api/indexers',
  '/api/indexers-enriched',
  '/api/network-stats',
  '/api/payments',
  '/api/poi',
  '/api/portfolio',
  '/api/price',
  '/api/provisions',
  '/api/reo',
  '/api/sql/query',
  '/api/subgraph-deployments',
  '/api/subgraph-fees-30d',
  '/api/subgraph-names',
  '/api/subgraph-search',
  '/api/sql/catalog',
  '/api/indexer-stake-history/',
  '/api/token-metrics',
  '/api/tvl',
  '/api/whoami',
];

/**
 * Is this exact route one of the migrated ones?
 *
 * A trailing slash in the list means "this and everything under it", which is how the parameterised
 * routes are expressed. Everything else must match exactly: `/api/indexers` must not swallow
 * `/api/indexers-enriched` by prefix, and a bare `startsWith` would do precisely that.
 */
function isMigrated(path: string): boolean {
  return MIGRATED.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Resolve real IP: Vercel sets x-forwarded-for; fall back to x-real-ip
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  const { allowed, remaining, limit } = await rateLimit(ip, path);

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  if (API_ORIGIN && isMigrated(path)) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, API_ORIGIN);
    const headers = new Headers(request.headers);
    // The client's address in a header of our own, not `X-Forwarded-For`. Caddy sits between this
    // and the backend and **replaces** the forwarded chain with its own peer unless that peer is a
    // configured trusted proxy - which is correct of it, and which means anything we put there is
    // gone by the time the backend reads it. A header Caddy does not manage passes through
    // untouched. See nightswatchhq/kittiwake#21.
    if (ip !== 'unknown') headers.set('x-lodestar-client', ip);
    if (EDGE_SECRET) headers.set('x-lodestar-edge', EDGE_SECRET);
    const response = NextResponse.rewrite(target, { request: { headers } });
    // Data, not a page. Without this the CDN would cache a figure that is fresh for thirty seconds
    // and serve it for as long as it felt like.
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Lodestar-Backend', 'kittiwake');
    return response;
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', String(limit));
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  return response;
}
