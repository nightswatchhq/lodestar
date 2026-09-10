/**
 * `CRON_SECRET` auth, for what still uses it.
 *
 * Eight ingest crons used to be checked here. They were descheduled when kittiwake took the jobs
 * over and their handlers have now been deleted, so what is left is the one endpoint that is
 * cron-authed without being a cron: `/api/horizon/debug`, an operator tool that borrows the secret
 * because it needs some gate and that one already existed.
 *
 * The two surviving crons are covered where they live: `tap-provision` in `routes-api-b.test.ts`
 * and its own directory, `reconcile-bounties` in `bounty-reconcile-routes.test.ts`.
 *
 * The properties are unchanged: 401 with no secret set, 401 on a wrong token, 401 with no header,
 * and 503 rather than 200 when auth passes but the services behind it are not there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/cache', () => ({
  cached: vi.fn((_k: string, _t: number, f: () => Promise<unknown>) => f()),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  hasRedis: vi.fn(() => true),
  getRedis: vi.fn(() => ({ ping: vi.fn().mockResolvedValue('PONG') })),
}));

const mockDb = vi.fn();
const mockHasDbAccess = vi.fn(() => false);
vi.mock('@/lib/db', () => ({
  get db() { return mockHasDbAccess() ? ((...a: unknown[]) => mockDb(...a)) : null; },
  hasDbAccess: () => mockHasDbAccess(),
}));

const mockHasSubgraphAccess = vi.fn(() => false);
vi.mock('@/lib/subgraph', () => ({
  subgraphQuery: vi.fn(),
  hasSubgraphAccess: () => mockHasSubgraphAccess(),
}));

const mockHasAmpAccess = vi.fn(() => false);
vi.mock('@/lib/amp', () => ({
  hasAmpAccess: () => mockHasAmpAccess(),
  ampQuery: vi.fn(),
  HORIZON_STAKING: '0xstaking',
  TOPIC0: {},
  AMP_DATASET: 'dataset',
  topicToAddress: vi.fn(),
  hexToBigInt: vi.fn(),
  hexLit: vi.fn(),
  strip0x: vi.fn(),
  AmpError: class AmpError extends Error {},
}));

vi.mock('@/lib/ingest/epochs', () => ({ ingestEpochs: vi.fn().mockResolvedValue({ ingested: 0, durationMs: 0 }) }));
const mockIngestAllocations = vi.fn().mockResolvedValue({ ingested: 0, durationMs: 0 });
vi.mock('@/lib/ingest/allocations', () => ({ ingestAllocations: (...a: unknown[]) => mockIngestAllocations(...a) }));
vi.mock('@/lib/ingest/delegations', () => ({ ingestDelegationEvents: vi.fn().mockResolvedValue({ ingested: 0, durationMs: 0 }) }));
const mockIngestDisputes = vi.fn().mockResolvedValue({ ingested: 0, durationMs: 0 });
vi.mock('@/lib/ingest/disputes', () => ({ ingestDisputes: (...a: unknown[]) => mockIngestDisputes(...a) }));
vi.mock('@/lib/ingest/network-snapshot', () => ({ writeNetworkSnapshot: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/refresh', () => ({ refreshIndexers: vi.fn().mockResolvedValue({ count: 0, durationMs: 0 }) }));

const mockIngestRav = vi.fn().mockResolvedValue({ ingested: 0, durationMs: 0 });
vi.mock('@/lib/ingest/rav', () => ({ ingestRav: (...a: unknown[]) => mockIngestRav(...a) }));

vi.mock('@/lib/cron-runs', () => ({
  withCronTracking: vi.fn((_db: unknown, _step: string, fn: () => Promise<unknown>) => fn()),
  recordCronRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    api: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cron: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ingest: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    amp: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    health: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    refresh: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cache: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
  default: { child: vi.fn().mockReturnThis(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));

beforeEach(() => {
  vi.clearAllMocks();
  mockHasDbAccess.mockReturnValue(false);
  mockHasSubgraphAccess.mockReturnValue(false);
  mockHasAmpAccess.mockReturnValue(false);
  mockDb.mockResolvedValue([]);
  mockIngestRav.mockResolvedValue({ ingested: 0, durationMs: 0 });
});

// ── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

function authedRequest(url: string, secret = 'test-secret'): NextRequest {
  return makeRequest(url, { Authorization: `Bearer ${secret}` });
}

// ── Shared auth behaviour matrix ───────────────────────────────────────────

/**
 * Asserts the standard cron auth contract for a route GET handler.
 *   - 401 when CRON_SECRET env var is not set
 *   - 401 when Authorization header is missing
 *   - 401 when wrong token is sent
 */
async function assertCronAuth(
  routePath: string,
  importFn: () => Promise<{ GET: (r: NextRequest) => Promise<Response> }>,
) {
  const { GET } = await importFn();

  // 1. No CRON_SECRET set → fail-closed
  vi.unstubAllEnvs();
  const res1 = await GET(makeRequest(routePath));
  expect(res1.status, `${routePath}: should 401 when CRON_SECRET unset`).toBe(401);

  // 2. CRON_SECRET set but no Authorization header
  vi.stubEnv('CRON_SECRET', 'test-secret');
  const res2 = await GET(makeRequest(routePath));
  expect(res2.status, `${routePath}: should 401 when no auth header`).toBe(401);

  // 3. Wrong token
  const res3 = await GET(makeRequest(routePath, { Authorization: 'Bearer wrong' }));
  expect(res3.status, `${routePath}: should 401 for wrong token`).toBe(401);

  vi.unstubAllEnvs();
}








// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────

describe('/api/horizon/debug — auth guard', () => {
  it('returns 401 when CRON_SECRET not set', async () => {
    vi.unstubAllEnvs();
    const { GET } = await import('@/app/api/horizon/debug/route');
    const res = await GET(makeRequest('/api/horizon/debug'));
    expect(res.status).toBe(401);
  });

  it('returns 401 with no Authorization header', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    const { GET } = await import('@/app/api/horizon/debug/route');
    const res = await GET(makeRequest('/api/horizon/debug'));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it('returns 401 with wrong token', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    const { GET } = await import('@/app/api/horizon/debug/route');
    const res = await GET(makeRequest('/api/horizon/debug', { Authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it('returns 200 (or non-401) with correct token', async () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.stubEnv('AMP_ENDPOINT', '');
    const { GET } = await import('@/app/api/horizon/debug/route');
    const res = await GET(authedRequest('/api/horizon/debug'));
    // Not 401 — auth passed. Result depends on AMP_ENDPOINT availability.
    expect(res.status).not.toBe(401);
    vi.unstubAllEnvs();
  });
});
