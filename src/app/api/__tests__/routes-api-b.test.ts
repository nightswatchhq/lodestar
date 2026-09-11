/**
 * API route tests (assignment api-routes-b)
 *
 *  - /api/indexer-node-health        — isSafeUrl SSRF guard + happy path
 *  - /api/indexer-status/[address]   — address validation + subgraph/status merge
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockCacheGet = vi.fn().mockResolvedValue(null);
const mockCacheSet = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/cache', () => ({
  cached: vi.fn((_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher()),
  cacheGet: (...args: unknown[]) => mockCacheGet(...args),
  cacheSet: (...args: unknown[]) => mockCacheSet(...args),
  hasRedis: vi.fn(() => false),
}));

const mockNuthatchSql = vi.fn();
const mockHasNuthatch = vi.fn(() => true);
vi.mock('@/lib/nuthatch', () => ({
  hasNuthatch: () => mockHasNuthatch(),
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
const mockSubgraphQuery = vi.fn();
const mockHasSubgraphAccess = vi.fn(() => true);
vi.mock('@/lib/subgraph', () => ({
  subgraphQuery: (...args: unknown[]) => mockSubgraphQuery(...args),
  hasSubgraphAccess: () => mockHasSubgraphAccess(),
}));

const mockDb = vi.fn();
const mockHasDbAccess = vi.fn(() => true);
vi.mock('@/lib/db', () => ({
  get db() { return mockHasDbAccess() ? ((...a: unknown[]) => mockDb(...a)) : null; },
  hasDbAccess: () => mockHasDbAccess(),
}));

// tap.ts is mocked for the tap-provision route (its real internals hit-chain).
const mockHasTapSigner = vi.fn(() => true);
const mockGetEscrowBalance = vi.fn();
const mockEnsureEscrow = vi.fn();
vi.mock('@/lib/tap', () => ({
  hasTapSigner: () => mockHasTapSigner(),
  getEscrowBalance: (...a: unknown[]) => mockGetEscrowBalance(...a),
  ensureEscrow: (...a: unknown[]) => mockEnsureEscrow(...a),
  MIN_ESCROW_WEI: 1_000_000_000_000_000_000n,
}));

const mockReadContract = vi.fn();
vi.mock('@/lib/reo-contract', () => ({
  arbitrumClient: { readContract: (...a: unknown[]) => mockReadContract(...a) },
}));

vi.mock('@/lib/bountyBoard', () => ({
  BOUNTY_BOARD_ABI: [],
}));

vi.mock('@/lib/studio/ipfs', () => ({
  ipfsHashToBytes32: vi.fn((h: string) => `0x${'a'.repeat(64)}` as `0x${string}`),
}));

vi.mock('@/lib/logger', () => ({
  log: {
    api: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    cron: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const CRON_SECRET = 'test-cron-secret';

beforeEach(() => {
  vi.clearAllMocks();
  mockCacheGet.mockResolvedValue(null);
  mockCacheSet.mockResolvedValue(undefined);
  mockHasSubgraphAccess.mockReturnValue(true);
  mockHasNuthatch.mockReturnValue(true);
  mockHasDbAccess.mockReturnValue(true);
  mockHasTapSigner.mockReturnValue(true);
  mockDb.mockResolvedValue([]);
  process.env.CRON_SECRET = CRON_SECRET;
  process.env.NEXT_PUBLIC_BOUNTY_BOARD_ADDRESS = '0xBb00000000000000000000000000000000000001';
});

function cronRequest(url: string, secret?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (secret !== undefined) headers['authorization'] = `Bearer ${secret}`;
  return new NextRequest(new URL(url, 'http://localhost:3000'), { headers });
}

function plainRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function statusResponse(indexingStatuses: unknown[]): Response {
  return new Response(JSON.stringify({ data: { indexingStatuses } }), { status: 200 });
}

// ============================================================
// /api/cron/refresh-chain-health
// ============================================================


// ============================================================
// /api/cron/tap-provision
// ============================================================


// ============================================================
// /api/indexer-node-health  (isSafeUrl SSRF guard)
// ============================================================

describe('/api/indexer-node-health', () => {
  let GET: (req: NextRequest) => Promise<Response>;
  const ADDR = '0x1234000000000000000000000000000000001234';

  beforeEach(async () => {
    const mod = await import('@/app/api/indexer-node-health/route');
    GET = mod.GET as typeof GET;
  });

  it('returns 400 when url or addr is missing', async () => {
    const res = await GET(plainRequest('/api/indexer-node-health'));
    expect(res.status).toBe(400);
  });

  const unsafe = [
    ['localhost', 'http://localhost:8030'],
    ['loopback 127.x', 'http://127.0.0.1:8030'],
    ['private 10.x', 'http://10.1.2.3:8030'],
    ['private 172.16-31', 'http://172.20.0.1:8030'],
    ['private 192.168.x', 'http://192.168.1.1:8030'],
    ['link-local 169.254 (metadata)', 'http://169.254.169.254/latest/meta-data'],
    ['IPv6 loopback', 'http://[::1]:8030'],
    ['non-http scheme', 'ftp://example.com'],
    ['file scheme', 'file:///etc/passwd'],
  ] as const;

  for (const [label, url] of unsafe) {
    it(`SSRF guard rejects ${label} (no fetch, returns reachable:false)`, async () => {
      const res = await GET(plainRequest(`/api/indexer-node-health?url=${encodeURIComponent(url)}&addr=${ADDR}`));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.data.reachable).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  }

  it('forwards safe public URLs and summarises node health', async () => {
    mockFetch.mockResolvedValueOnce(statusResponse([
      { synced: true, health: 'healthy', chains: [{ chainHeadBlock: { number: 100 }, latestBlock: { number: 100 } }] },
      { synced: false, health: 'healthy', chains: [{ chainHeadBlock: { number: 1100 }, latestBlock: { number: 1000 } }] },
      { synced: false, health: 'failed', chains: [] },
    ]));

    const res = await GET(plainRequest(`/api/indexer-node-health?url=${encodeURIComponent('https://node.example.com')}&addr=${ADDR}`));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(json.data.reachable).toBe(true);
    expect(json.data.totalDeployments).toBe(3);
    expect(json.data.syncedCount).toBe(1);
    expect(json.data.worstBlocksBehind).toBe(100); // from the lagging (non-failed) deployment
  });

  it('returns reachable:false when the node responds non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(new Response('nope', { status: 502 }));
    const res = await GET(plainRequest(`/api/indexer-node-health?url=${encodeURIComponent('https://node.example.com')}&addr=${ADDR}`));
    const json = await res.json();
    expect(json.data.reachable).toBe(false);
  });
});

// ============================================================
// /api/indexer-status/[address]
// ============================================================

describe('/api/indexer-status/[address]', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<{ address: string }> }) => Promise<Response>;
  const VALID = '0x1234000000000000000000000000000000001234';

  beforeEach(async () => {
    const mod = await import('@/app/api/indexer-status/[address]/route');
    GET = mod.GET as typeof GET;
  });

  it('returns 503 when no nest is configured', async () => {
    mockHasNuthatch.mockReturnValue(false);
    const res = await GET(plainRequest(`/api/indexer-status/${VALID}`), { params: Promise.resolve({ address: VALID }) });
    expect(res.status).toBe(503);
  });

  it('returns 400 for an invalid address format', async () => {
    const res = await GET(plainRequest('/api/indexer-status/0xnothex'), { params: Promise.resolve({ address: '0xnothex' }) });
    expect(res.status).toBe(400);
  });

  it('returns an empty deployment summary when the indexer has no allocations', async () => {
    indexerStatusNest({ indexer: { url: null }, allocations: [] });
    const res = await GET(plainRequest(`/api/indexer-status/${VALID}`), { params: Promise.resolve({ address: VALID }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.totalAllocations).toBe(0);
    expect(json.data.deployments).toEqual([]);
  });

  it('marks deployments unreachable when the indexer URL is unsafe (SSRF) — no status fetch', async () => {
    indexerStatusNest({
      indexer: { url: 'http://127.0.0.1:8030' }, // unsafe → status fetch skipped
      allocations: [{
        id: 'alloc1',
        allocatedTokens: '1000',
        createdAtEpoch: 100,
        subgraphDeployment: { id: 'dep1', ipfsHash: 'QmHash1', signalledTokens: '5', stakedTokens: '9', versions: [] },
      }],
    });

    const res = await GET(plainRequest(`/api/indexer-status/${VALID}`), { params: Promise.resolve({ address: VALID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(json.data.totalAllocations).toBe(1);
    expect(json.data.unreachableCount).toBe(1);
    expect(json.data.deployments[0].status).toBe('unreachable');
  });

  it('merges live status: synced / syncing / failed classification', async () => {
    indexerStatusNest({
      indexer: { url: 'https://node.example.com' },
      allocations: [
        { id: 'a1', allocatedTokens: '1', createdAtEpoch: 1, subgraphDeployment: { id: 'd1', ipfsHash: 'QmSynced', signalledTokens: '0', stakedTokens: '0', versions: [] } },
        { id: 'a2', allocatedTokens: '1', createdAtEpoch: 1, subgraphDeployment: { id: 'd2', ipfsHash: 'QmSyncing', signalledTokens: '0', stakedTokens: '0', versions: [] } },
        { id: 'a3', allocatedTokens: '1', createdAtEpoch: 1, subgraphDeployment: { id: 'd3', ipfsHash: 'QmFailed', signalledTokens: '0', stakedTokens: '0', versions: [] } },
      ],
    });
    // status endpoint responds for all three
    mockFetch.mockResolvedValueOnce(statusResponse([
      { subgraph: 'QmSynced', synced: true, health: 'healthy', chains: [{ network: 'mainnet', chainHeadBlock: { number: 1000 }, latestBlock: { number: 1000 } }] },
      { subgraph: 'QmSyncing', synced: false, health: 'healthy', chains: [{ network: 'mainnet', chainHeadBlock: { number: 5000 }, latestBlock: { number: 1000 } }] },
      { subgraph: 'QmFailed', synced: false, health: 'failed', fatalError: { message: 'boom' }, chains: [] },
    ]));

    const res = await GET(plainRequest(`/api/indexer-status/${VALID}`), { params: Promise.resolve({ address: VALID }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.totalAllocations).toBe(3);
    expect(json.data.syncedCount).toBe(1);
    expect(json.data.syncingCount).toBe(1);
    expect(json.data.failedCount).toBe(1);
    // failed sorts first
    expect(json.data.deployments[0].status).toBe('failed');
    expect(json.data.deployments[0].fatalError).toBe('boom');
  });

  it('returns 500 when the subgraph query throws', async () => {
    mockNuthatchSql.mockRejectedValueOnce(new Error('subgraph down'));
    const res = await GET(plainRequest(`/api/indexer-status/${VALID}`), { params: Promise.resolve({ address: VALID }) });
    expect(res.status).toBe(500);
  });
});

