import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';
// One list, shared with the migration inventory and its filesystem check. Keeping a second copy
// here is the defect behind nightswatchhq/kittiwake#23.
import { isMigrated } from '@/lib/migration';

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
