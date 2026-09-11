/**
 * API Route Contract Tests
 *
 * These tests verify the response shapes, status codes, and edge cases for
 * every API route. External dependencies (Redis, subgraph, fetch) are mocked
 * so we test our route logic in isolation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ipfsHashToBytes32 } from '@/lib/studio/ipfs';

// ---------- Mocks ----------

// Mock @/lib/cache — bypass Redis entirely
const mockCacheGet = vi.fn((): Promise<unknown> => Promise.resolve(null));
vi.mock('@/lib/cache', () => ({
  cached: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
  cacheGet: (...args: unknown[]) => (mockCacheGet as (...a: unknown[]) => unknown)(...args),
  cacheSet: vi.fn(),
  redis: { get: vi.fn(), set: vi.fn() },
}));

// Mock @/lib/subgraph
const mockSubgraphQuery = vi.fn();
const mockEnsQuery = vi.fn();
const mockNuthatchSql = vi.fn();
const mockHasNuthatch = vi.fn(() => false);
vi.mock('@/lib/nuthatch', () => ({
  hasNuthatch: () => mockHasNuthatch(),
  nuthatchEnabled: (flag: string) => mockHasNuthatch() && process.env[flag] === 'true',
  nuthatchSql: (...args: unknown[]) => mockNuthatchSql(...args),
  nuthatchSqlReady: async (...args: unknown[]) => {
    const rows = await mockNuthatchSql(...args);
    return { ok: true, data: { rows, count: Array.isArray(rows) ? rows.length : 0 } };
  },
}));

const mockHasSubgraphAccess = vi.fn(() => true);

const mockResolveEnsName = vi.fn<(a: string) => Promise<string | null>>();
// The group-B routes read the gns nest and IPFS through these helpers (nuthatch#1160); the
// helpers' own logic is tested in lib/__tests__/subgraph-metadata-search.test.ts.
const mockSearchByName = vi.fn();
const mockSearchByHashPrefix = vi.fn();
const mockSearchByManifestAddress = vi.fn();
const mockIpfsJson = vi.fn();
vi.mock('@/lib/subgraph-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/subgraph-metadata')>()),
  searchSubgraphsByName: (...a: unknown[]) => mockSearchByName(...a),
  searchDeploymentsByHashPrefix: (...a: unknown[]) => mockSearchByHashPrefix(...a),
  searchDeploymentsByManifestAddress: (...a: unknown[]) => mockSearchByManifestAddress(...a),
  ipfsJson: (...a: unknown[]) => mockIpfsJson(...a),
}));
vi.mock('@/lib/ens', () => ({
  resolveEnsName: (a: string) => mockResolveEnsName(a),
  resolveEnsNames: vi.fn(async () => ({})),
}));
vi.mock('@/lib/subgraph', () => ({
  subgraphQuery: (...args: unknown[]) => mockSubgraphQuery(...args),
  ensQuery: (...args: unknown[]) => mockEnsQuery(...args),
  hasSubgraphAccess: () => mockHasSubgraphAccess(),
  delegationEventsQuery: vi.fn(),
}));

// Mock @/lib/reo-contract
vi.mock('@/lib/reo-contract', () => ({
  checkOracleEligibility: vi.fn(() =>
    Promise.resolve({
      address: '0xtest',
      isEligible: true,
      renewalTimestamp: 1700000000,
      eligibilityPeriod: 2592000,
      expiresAt: 1702592000,
      daysRemaining: 30,
    }),
  ),
}));

// Mock @/lib/indexing-status
// A factory mock replaces the whole module, so every export the routes import
// has to appear here or it arrives as undefined and the route throws.
vi.mock('@/lib/indexing-status', () => ({
  queryIndexerStatus: vi.fn(() => Promise.resolve(null)),
  buildIndexerStatus: vi.fn(
    (id: string, name: string | null, url: string, allocated: string) => ({
      indexerId: id,
      indexerName: name,
      url,
      allocatedTokens: allocated,
      status: 'unreachable',
    }),
  ),
  // Reconciliation is peer-relative and has its own unit tests; here it just
  // has to preserve the list so the route's shape assertions stay meaningful.
  reconcileToNetworkHead: vi.fn((indexers: unknown[]) => indexers),
  // RFC-006 D1 serving probe. No network in tests, so report unreachable.
  probeServing: vi.fn(() => Promise.resolve('unreachable')),
  probeServingDetailed: vi.fn(() =>
    Promise.resolve({ probe: 'unreachable', cause: 'guard', error: null, status: null, contentType: null, paid: false, attempts: 0, elapsedMs: 0 }),
  ),
  withServeProbe: vi.fn((result: Record<string, unknown>, probe: string | { probe: string }) => {
    const verdict = typeof probe === 'string' ? probe : probe.probe;
    return {
      ...result,
      serveProbe: verdict,
      ...(typeof probe === 'string' ? {} : { serveProbeDetail: probe }),
      servable: verdict === 'serving' || verdict === 'alive_paid',
    };
  }),
}));

// Mock global fetch for routes that call external APIs directly
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` keeps queued `mockResolvedValueOnce` answers; a case that queues a gateway
  // answer no route consumes any more would otherwise hand it to the next case's call.
  mockSubgraphQuery.mockReset();
  mockHasSubgraphAccess.mockReturnValue(true);
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
// /api/price
// ============================================================


// ============================================================
// /api/tvl
// ============================================================


// ============================================================
// /api/network-stats
// ============================================================

// ============================================================
// /api/indexers
// ============================================================

// ============================================================
// /api/indexers-enriched
// ============================================================


// ============================================================
// /api/epochs
// ============================================================

// ============================================================
// /api/ens
// ============================================================


// ============================================================
// /api/manifest
// ============================================================


// ============================================================
// /api/reo
// ============================================================


// ============================================================
// /api/subgraph-search
// ============================================================


// ============================================================
// /api/subgraph-versions/[hash]
// ============================================================


// ============================================================
// /api/indexer/[address]
// ============================================================

// ============================================================
// /api/indexing-status/[hash]
// ============================================================

describe('/api/indexing-status/[hash]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ hash: string }> }) => Promise<Response>;

  const QM = 'QmNRuGkzXYPd75LbqHfx6Ksu8n7eDHwD18VCU3UEoxAZxT';
  /** The deployment's figures and its allocations from the nest (nuthatch#1160); `null` is an unknown deployment. */
  function nest(deployment: { signalled_tokens: string; staked_tokens: string } | null, allocations: Array<{ indexer: string; url: string | null; allocated_tokens: string }>) {
    mockNuthatchSql.mockImplementation(async (sql: string) => {
      if (sql.includes('GROUP BY 1')) return deployment ? [{ subgraph_deployment: '0xdep', ...deployment, allocations: allocations.length }] : [];
      if (sql.includes('LEFT JOIN lodestar_indexers')) return allocations;
      return [];
    });
  }

  beforeEach(async () => {
    mockHasNuthatch.mockReturnValue(true);
    const mod = await import('@/app/api/indexing-status/[hash]/route');
    GET = mod.GET as typeof GET;
  });

  it('returns deployment indexing status for bytes32 ID', async () => {
    // A 0x hash is the bytes32 id itself - no resolution step
    nest({ signalled_tokens: '100', staked_tokens: '200' }, [{ indexer: '0x1', url: null, allocated_tokens: '1000000000000000000000000' }]);

    const req = makeRequest('/api/indexing-status/0xdep1');
    const res = await GET(req, { params: Promise.resolve({ hash: '0xdep1' }) });
    const json = await getJson(res);

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('data');
    expect(json.data).toHaveProperty('deploymentId');
    expect(json.data).toHaveProperty('indexers');
    expect(json.data).toHaveProperty('totalIndexers');
    expect(json.data).toHaveProperty('syncedCount');
  });

  it('turns a Qm hash into its bytes32 id and returns status', async () => {
    nest({ signalled_tokens: '100', staked_tokens: '200' }, []);

    const req = makeRequest(`/api/indexing-status/${QM}`);
    const res = await GET(req, { params: Promise.resolve({ hash: QM }) });

    expect(res.status).toBe(200);
    const asked = mockNuthatchSql.mock.calls.map((c) => String(c[0])).join(' ');
    expect(asked).toContain(ipfsHashToBytes32(QM).toLowerCase());
  });

  it('returns 404 when the deployment is unknown to the nest', async () => {
    nest(null, []);

    const req = makeRequest(`/api/indexing-status/${QM}`);
    const res = await GET(req, { params: Promise.resolve({ hash: QM }) });
    // The route throws 'Deployment not found' which is caught and returns 404
    expect(res.status).toBe(404);
  });

  it('returns 503 when no nest is configured', async () => {
    mockHasNuthatch.mockReturnValue(false);
    const req = makeRequest(`/api/indexing-status/${QM}`);
    const res = await GET(req, { params: Promise.resolve({ hash: QM }) });
    expect(res.status).toBe(503);
  });
});

// ============================================================
// /api/delegation-events
// ============================================================


// ============================================================
// Security: input validation across routes
// ============================================================

