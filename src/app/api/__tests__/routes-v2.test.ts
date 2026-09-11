/**
 * API Route Contract Tests — Part 2
 *
 * Covers all routes not tested in routes.test.ts:
 * portfolio, provisions, indexer-status, payments,
 * feed, networks, parameter-history, vote, token-metrics,
 * rewards-history, health
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------- Mocks ----------

// @/lib/cache — bypass Redis entirely
const mockCacheGet = vi.fn(() => Promise.resolve(null));
vi.mock('@/lib/cache', () => ({
  cached: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
  cacheGet: (...args: unknown[]) => (mockCacheGet as (...a: unknown[]) => unknown)(...args),
  cacheSet: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn(), ping: vi.fn().mockResolvedValue('PONG') },
  hasRedis: vi.fn(() => true),
  getRedis: vi.fn(() => ({ ping: vi.fn().mockResolvedValue('PONG') })),
}));

// @/lib/subgraph
const mockSubgraphQuery = vi.fn();
const mockHasSubgraphAccess = vi.fn(() => true);
const mockNuthatchSql = vi.fn();
const mockHasNuthatch = vi.fn(() => true);
vi.mock('@/lib/nuthatch', () => ({
  hasNuthatch: () => mockHasNuthatch(),
  // Routes still behind a plain flag (feed, dips) see it off here, as before this mock existed.
  nuthatchEnabled: () => false,
  nuthatchSql: (...a: unknown[]) => mockNuthatchSql(...a),
  nuthatchSqlReady: async (...a: unknown[]) => {
    const rows = await mockNuthatchSql(...a);
    return { ok: true, data: { rows, count: rows.length } };
  },
}));
/** Feed indexer-status's two nest queries from a gateway-shaped fixture (nuthatch#1160). */
function indexerStatusNest(gw: {
  indexer: { url: string | null } | null;
  allocations: Array<{ id: string; allocatedTokens: string; createdAtEpoch: number; subgraphDeployment: { id: string; ipfsHash: string; signalledTokens: string; stakedTokens: string; versions?: unknown } }>;
}) {
  mockNuthatchSql.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM lodestar_indexers WHERE id')) return gw.indexer ? [{ url: gw.indexer.url }] : [];
    if (sql.includes('FROM lodestar_allocations')) {
      return gw.allocations.map((a) => ({
        id: a.id, allocated_tokens: a.allocatedTokens, created_at_epoch: a.createdAtEpoch,
        subgraph_deployment: a.subgraphDeployment.ipfsHash, signalled_tokens: a.subgraphDeployment.signalledTokens,
        deployment_staked_tokens: a.subgraphDeployment.stakedTokens,
      }));
    }
    return [];
  });
}
vi.mock('@/lib/subgraph', () => ({
  subgraphQuery: (...args: unknown[]) => mockSubgraphQuery(...args),
  ensQuery: vi.fn(),
  hasSubgraphAccess: () => mockHasSubgraphAccess(),
  delegationEventsQuery: vi.fn(),
}));

// @/lib/db — db export is nullable (null when hasDbAccess() is false)
// The vote route checks `if (!db)` directly, so we need db to actually be null
// when the DB is unconfigured.
const mockDb = vi.fn();
const mockHasDbAccess = vi.fn(() => false);
vi.mock('@/lib/db', () => ({
  get db() {
    return mockHasDbAccess() ? ((...args: unknown[]) => mockDb(...args)) : null;
  },
  hasDbAccess: () => mockHasDbAccess(),
}));

// @/lib/cron-runs
vi.mock('@/lib/cron-runs', () => ({
  recordCronRun: vi.fn().mockResolvedValue(undefined),
}));

// @/lib/logger
vi.mock('@/lib/logger', () => ({
  log: {
    api: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cron: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    health: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ingest: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    amp: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cache: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    refresh: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
  default: { child: vi.fn().mockReturnThis(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  mockHasNuthatch.mockReturnValue(true);
  mockSubgraphQuery.mockReset();
  // Re-establish defaults after clearAllMocks (which may clear implementations)
  mockDb.mockResolvedValue([]);
  mockHasSubgraphAccess.mockReturnValue(true);
  mockHasDbAccess.mockReturnValue(false);
  mockCacheGet.mockResolvedValue(null);
  mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
});

// ---------- Helpers ----------

function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

async function getJson(response: Response) {
  return response.json();
}

// ============================================================
// /api/portfolio
// ============================================================


// ============================================================
// /api/provisions
// ============================================================


// ============================================================
// /api/indexer-status/[address]
// ============================================================


// ============================================================
// /api/payments
// ============================================================


// ============================================================
// /api/parameter-history/[address]
// ============================================================

// ============================================================
// /api/token-metrics
// ============================================================


// ============================================================
// /api/rewards-history
// ============================================================


// ============================================================
// /api/health
// ============================================================

describe('/api/health', () => {
  let GET: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    // Reset mockDb queue — vi.clearAllMocks() does not flush onceImplementations
    mockDb.mockReset();
    mockDb.mockResolvedValue([]);
    const mod = await import('@/app/api/health/route');
    GET = mod.GET as (req: NextRequest) => Promise<Response>;
  });

  it('returns status with components shape', async () => {
    const req = makeRequest('/api/health');
    const res = await GET(req);
    const json = await getJson(res);

    // Either 200 (healthy/degraded) or 503 (unhealthy — postgres down)
    expect([200, 503]).toContain(res.status);
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('timestamp');
    expect(json).toHaveProperty('components');
    expect(json.components).toHaveProperty('postgres');
    expect(json.components).toHaveProperty('redis');
  });

  it('reports postgres as down when DB not configured', async () => {
    // mockHasDbAccess returns false by default → postgres: down
    const req = makeRequest('/api/health');
    const res = await GET(req);
    const json = await getJson(res);

    expect(json.status).toBe('unhealthy');
    expect(json.components.postgres.status).toBe('down');
    expect(res.status).toBe(503);
  });

  it('returns ingestion status when postgres is up', async () => {
    mockHasDbAccess.mockReturnValue(true);
    // SELECT 1 probe
    mockDb.mockResolvedValueOnce([{ '?column?': 1 }]);
    // ingestion_state query
    mockDb.mockResolvedValueOnce([
      { key: 'epochs', updated_at: new Date(Date.now() - 30 * 60000) },
    ]);
    // cron_runs query
    mockDb.mockResolvedValueOnce([]);

    const req = makeRequest('/api/health');
    const res = await GET(req);
    const json = await getJson(res);

    expect(json.components.postgres.status).toBe('up');
    expect(json).toHaveProperty('ingestion');
    expect(json.ingestion).toHaveProperty('epochs');
    expect(json.ingestion.epochs.healthy).toBe(true);
  });
});

// ============================================================
// /api/cron/refresh
// ============================================================

