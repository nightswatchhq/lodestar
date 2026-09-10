/**
 * `CRON_SECRET` fails closed, for the two crons still served here.
 *
 * This file used to check eight ingest crons and `/api/horizon/debug`; all nine have been deleted
 * as the migration moved their work to kittiwake. What survives is the property worth keeping and
 * the one the other tests do not cover: with no secret configured at all, a cron route must refuse
 * rather than allow.
 *
 * That is the direction that matters. A wrong token is refused by any implementation; an *absent*
 * secret is refused only by one that decided to. `tap-provision` spends GRT and `reconcile-bounties`
 * writes `sync_bounties`, so an open door on either is not a small thing. Their happy paths and
 * wrong-token cases live in `routes-api-b.test.ts` and `bounty-reconcile-routes.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/cache', () => ({
  cached: vi.fn((_k: string, _t: number, f: () => Promise<unknown>) => f()),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  hasRedis: vi.fn(() => true),
}));

vi.mock('@/lib/db', () => ({ db: null, hasDbAccess: () => false }));
vi.mock('@/lib/logger', () => ({
  log: { api: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }, cron: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } },
}));

function request(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`));
}

beforeEach(() => {
  vi.resetModules();
  // Not merely wrong: absent. `vi.stubEnv` with undefined leaves the key present on some runtimes,
  // so it is deleted outright.
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('a cron route with no CRON_SECRET configured', () => {
  it('refuses tap-provision', async () => {
    const { GET } = await import('@/app/api/cron/tap-provision/route');
    const res = await GET(request('/api/cron/tap-provision'));
    expect(res.status).toBe(401);
  });

  it('refuses reconcile-bounties', async () => {
    const { GET } = await import('@/app/api/cron/reconcile-bounties/route');
    const res = await GET(request('/api/cron/reconcile-bounties'));
    expect(res.status).toBe(401);
  });

  it('refuses them with a bearer token too, since there is nothing to match it against', async () => {
    const { GET } = await import('@/app/api/cron/tap-provision/route');
    const res = await GET(
      new NextRequest(new URL('http://localhost/api/cron/tap-provision'), {
        headers: { Authorization: 'Bearer anything' },
      }),
    );
    expect(res.status).toBe(401);
  });
});
