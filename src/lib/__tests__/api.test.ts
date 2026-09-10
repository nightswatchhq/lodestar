import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchNetworkStats,
  fetchEpochHistory,
  fetchIndexers,
  fetchEnrichedIndexers,
  fetchGRTPrice,
  fetchIndexerProvisions,
  fetchDelegatorPortfolio,
  fetchCuratorPortfolio,
  fetchSubgraphDeployments,
  fetchManifestAnalysis,
  fetchTokenMetrics,
  fetchDelegationFlows,
  fetchWithRetry,
  fetchTVL,
  fetchSubgraphDeployments30d,
  fetchPOIOverview,
  fetchPOIDeployment,
  fetchIndexingStatus,
  fetchIndexerStatus,
  fetchRewardsHistory,
  fetchPayments,
  fetchIndexerPayments,
  fetchIndexerStakeHistory,
  fetchParameterHistory,
  fetchSubgraphCuration,
  fetchSubgraphSchema,
  fetchCuratorLeaderboard,
} from '@/lib/api';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

/**
 * Minimal payloads that still satisfy each route's contract (`src/lib/contract.ts`).
 *
 * These used to be skeletons - `{ data: {} }` was enough to prove a URL was built correctly, and
 * that is all these tests were ever asked to prove. That is the habit #124 is about: a fixture that
 * asserts nothing about shape cannot notice when the shape changes, which is how #114 stayed green
 * through a day of dashes. So a fixture here now carries the keys the client destructures and
 * nothing more, and a route that stops sending one of them fails a test rather than a page.
 *
 * Empty collections are deliberate throughout: presence is not fullness, and an address with no
 * history is not a broken contract.
 */
const OK = {
  networkStats: { data: { graphNetwork: { currentEpoch: 900, totalTokensStaked: '1' }, grtSupply: null } },
  epochs: { data: { epoches: [] } },
  indexers: { data: { indexers: [] } },
  provisions: { data: { provisions: [] } },
  portfolio: { data: { delegator: null, curator: null } },
  poiOverview: { data: { summary: { overallConsensusRate: 1 }, deployments: [] } },
  poiDeployment: { data: { deploymentId: 'Qm1', ipfsHash: 'Qm1', epochs: [] } },
  indexingStatus: { data: { deploymentId: 'Qm1', indexers: [] } },
  indexerStatus: { data: { indexerAddress: '0xabc', deployments: [] } },
  payments: {
    data: { totalCollected: '1', activePayers: 2, escrowAccounts: [], recentTransactions: [] },
  },
  curation: { data: { totalSignalledTokens: '1', queryFeesAmount: '2', signals: [] } },
} as const;

describe('api: URL building', () => {
  it('builds epoch URL with the count query param', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.epochs));
    await fetchEpochHistory(42);
    expect(mockFetch).toHaveBeenCalledWith('/api/epochs?count=42');
  });

  it('defaults epoch count to 30', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.epochs));
    await fetchEpochHistory();
    expect(mockFetch).toHaveBeenCalledWith('/api/epochs?count=30');
  });

  it('encodes indexer params with defaults applied', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.indexers));
    await fetchIndexers({});
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/indexers?');
    expect(url).toContain('first=25');
    expect(url).toContain('skip=0');
    expect(url).toContain('orderBy=stakedTokens');
    expect(url).toContain('orderDirection=desc');
  });

  it('overrides indexer params when provided', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.indexers));
    await fetchIndexers({ first: 5, skip: 10, orderBy: 'createdAt', orderDirection: 'asc' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('first=5');
    expect(url).toContain('skip=10');
    expect(url).toContain('orderBy=createdAt');
    expect(url).toContain('orderDirection=asc');
  });

  it('URL-encodes addresses to prevent injection', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.provisions));
    await fetchIndexerProvisions('0xAbc&evil=1');
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain(encodeURIComponent('0xAbc&evil=1'));
    expect(url).not.toContain('&evil=1');
  });

  it('selects delegator vs curator portfolio via type param', async () => {
    mockFetch.mockImplementation(() => Promise.resolve(jsonResponse(OK.portfolio)));
    await fetchDelegatorPortfolio('0xdel');
    await fetchCuratorPortfolio('0xcur');
    expect(mockFetch.mock.calls[0][0]).toContain('type=delegator');
    expect(mockFetch.mock.calls[1][0]).toContain('type=curator');
  });

  it('omits empty subgraph-deployment params', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchSubgraphDeployments();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe('/api/subgraph-deployments?');
  });

  it('includes only provided subgraph-deployment params', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchSubgraphDeployments({ first: 3, orderDirection: 'asc' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('first=3');
    expect(url).toContain('orderDirection=asc');
    expect(url).not.toContain('skip=');
  });

  it('builds delegation-flows URL with compare flag', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchDelegationFlows(7, true);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/delegation-flows?days=7&compare=1');
  });

  it('omits compare flag when false', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchDelegationFlows(7, false);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/delegation-flows?days=7');
  });
});

describe('api: response unwrapping', () => {
  it('unwraps the .data envelope', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.networkStats));
    expect(await fetchNetworkStats()).toEqual(OK.networkStats.data);
  });

  it('returns the raw json for enriched indexers (no envelope)', async () => {
    const payload = { indexers: [], computedAt: 1 };
    mockFetch.mockResolvedValue(jsonResponse(payload));
    expect(await fetchEnrichedIndexers()).toEqual(payload);
  });

  it('returns raw json for price endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ price: 0.1, change24h: -2 }));
    expect(await fetchGRTPrice()).toEqual({ price: 0.1, change24h: -2 });
  });

  // These two used to assert `?? []` - that a route answering `{}` produced an empty chart rather
  // than an error. That is the silent degraded render #114 turned into a day, so it is now a throw
  // that names what arrived. An empty chart is still reachable, but only when the server sends an
  // empty array on purpose.
  it('throws rather than rendering an empty chart when token-metrics omits data', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ metrics: [] }));
    await expect(fetchTokenMetrics()).rejects.toThrow(/expected an array at "data".*metrics/s);
  });

  it('throws rather than rendering an empty chart when delegation-flows omits data', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ flows: [] }));
    await expect(fetchDelegationFlows()).rejects.toThrow(/expected an array at "data".*flows/s);
  });

  it('still accepts a deliberately empty collection', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    expect(await fetchTokenMetrics()).toEqual([]);
  });
});

describe('api: error handling (4xx vs 5xx)', () => {
  it('throws with status code on 404', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchNetworkStats()).rejects.toThrow('Network stats failed: 404');
  });

  it('throws with status code on 500', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchEpochHistory()).rejects.toThrow('Epoch history failed: 500');
  });

  it('throws static message for enriched indexers on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 503));
    await expect(fetchEnrichedIndexers()).rejects.toThrow('Enriched data not available');
  });

  it('throws manifest error with status', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 422));
    await expect(fetchManifestAnalysis('Qm')).rejects.toThrow('Manifest analysis failed: 422');
  });
});


describe('api: raw-json (no envelope) endpoints', () => {
  it('fetchTVL returns the raw json on success', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ tvl: 1234 }));
    expect(await fetchTVL()).toEqual({ tvl: 1234 });
    expect(mockFetch).toHaveBeenCalledWith('/api/tvl');
  });

  it('fetchTVL throws the static message on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchTVL()).rejects.toThrow('Failed to fetch TVL');
  });

  it('fetchRewardsHistory builds the address+days query and returns raw json', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ history: [] }));
    expect(await fetchRewardsHistory('0xDeL', 45)).toEqual({ history: [] });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/api/rewards-history?');
    expect(url).toContain('address=0xDeL');
    expect(url).toContain('days=45');
  });

  it('fetchRewardsHistory defaults days to 90 and throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchRewardsHistory('0xabc')).rejects.toThrow('Rewards history failed: 404');
    expect(mockFetch.mock.calls[0][0]).toContain('days=90');
  });
});

describe('api: .data-envelope endpoints (happy + error)', () => {
  it('fetchSubgraphDeployments30d unwraps .data and hits the right path', async () => {
    const rows = [{ id: 'd1', ipfsHash: 'Qm1', queryFees30d: '0' }];
    mockFetch.mockResolvedValue(jsonResponse({ data: rows }));
    expect(await fetchSubgraphDeployments30d()).toEqual(rows);
    expect(mockFetch).toHaveBeenCalledWith('/api/subgraph-fees-30d');
  });

  it('fetchSubgraphDeployments30d throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchSubgraphDeployments30d()).rejects.toThrow('30d fees fetch failed: 500');
  });

  it('fetchPOIOverview unwraps .data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.poiOverview));
    expect(await fetchPOIOverview()).toEqual(OK.poiOverview.data);
    expect(mockFetch).toHaveBeenCalledWith('/api/poi');
  });

  it('fetchPOIOverview throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 502));
    await expect(fetchPOIOverview()).rejects.toThrow('POI overview failed: 502');
  });

  it('fetchPOIDeployment encodes the deployment and unwraps .data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.poiDeployment));
    expect(await fetchPOIDeployment('Qm/with slash')).toEqual(OK.poiDeployment.data);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('deployment=');
    expect(url).toContain(encodeURIComponent('Qm/with slash'));
  });

  it('fetchPOIDeployment throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchPOIDeployment('Qm')).rejects.toThrow('POI detail failed: 404');
  });

  it('fetchIndexingStatus encodes the hash into the path segment', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.indexingStatus));
    expect(await fetchIndexingStatus('Qm Hash&x')).toEqual(OK.indexingStatus.data);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe(`/api/indexing-status/${encodeURIComponent('Qm Hash&x')}`);
  });

  it('fetchIndexingStatus throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchIndexingStatus('Qm')).rejects.toThrow('Indexing status failed: 500');
  });

  it('fetchIndexerStatus encodes the address into the path and unwraps .data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.indexerStatus));
    expect(await fetchIndexerStatus('0xABC')).toEqual(OK.indexerStatus.data);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/indexer-status/0xABC');
  });

  it('fetchIndexerStatus throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 503));
    await expect(fetchIndexerStatus('0xabc')).rejects.toThrow('Indexer status failed: 503');
  });

  it('fetchPayments unwraps .data', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.payments));
    expect(await fetchPayments()).toEqual(OK.payments.data);
    expect(mockFetch).toHaveBeenCalledWith('/api/payments');
  });

  it('fetchPayments throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchPayments()).rejects.toThrow('Payments failed: 500');
  });

  it('fetchIndexerPayments adds the receiver query param', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.payments));
    expect(await fetchIndexerPayments('0xRecv&evil')).toEqual(OK.payments.data);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('receiver=');
    expect(url).toContain(encodeURIComponent('0xRecv&evil'));
    expect(url).not.toContain('&evil');
  });

  it('fetchIndexerPayments throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchIndexerPayments('0xabc')).rejects.toThrow('Indexer payments failed: 404');
  });

  it('fetchIndexerStakeHistory unwraps .data from the path endpoint', async () => {
    const history = [{ date: 'd', selfStakeGrt: 1, delegatedGrt: 2 }];
    mockFetch.mockResolvedValue(jsonResponse({ data: { history } }));
    expect(await fetchIndexerStakeHistory('0xStk')).toEqual({ history });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/indexer-stake-history/0xStk');
  });

  it('fetchIndexerStakeHistory throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchIndexerStakeHistory('0xabc')).rejects.toThrow('Stake history failed: 500');
  });

  it('fetchParameterHistory throws when data is missing entirely', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));
    await expect(fetchParameterHistory('0xPrm')).rejects.toThrow('expected an array at "data"');
    expect(mockFetch.mock.calls[0][0]).toBe('/api/parameter-history/0xPrm');
  });

  // An indexer that has never changed a parameter: the route sends the empty array itself.
  it('fetchParameterHistory accepts an empty history', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    expect(await fetchParameterHistory('0xPrm')).toEqual([]);
  });

  it('fetchParameterHistory returns the data array when present', async () => {
    const rows = [{ param_name: 'cut', new_value: 1, detected_at: 'now' }];
    mockFetch.mockResolvedValue(jsonResponse({ data: rows }));
    expect(await fetchParameterHistory('0xabc')).toEqual(rows);
  });

  it('fetchParameterHistory throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchParameterHistory('0xabc')).rejects.toThrow('Parameter history failed: 500');
  });

  it('fetchSubgraphCuration unwraps .data from the path endpoint', async () => {
    mockFetch.mockResolvedValue(jsonResponse(OK.curation));
    expect(await fetchSubgraphCuration('QmHash')).toEqual(OK.curation.data);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/subgraph-curation/QmHash');
  });

  it('fetchSubgraphCuration throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 404));
    await expect(fetchSubgraphCuration('Qm')).rejects.toThrow('Subgraph curation failed: 404');
  });

  it('fetchSubgraphSchema unwraps .data', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { schemaText: 'type X', schemaHash: 'h' } }));
    expect(await fetchSubgraphSchema('QmSchema')).toEqual({ schemaText: 'type X', schemaHash: 'h' });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/subgraph-schema/QmSchema');
  });

  it('fetchSubgraphSchema throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchSubgraphSchema('Qm')).rejects.toThrow('Schema fetch failed: 500');
  });

  it('fetchCuratorLeaderboard applies first/skip defaults and unwraps .data', async () => {
    const rows = [{ id: '0x1', curator: '0x1' }];
    mockFetch.mockResolvedValue(jsonResponse({ data: rows }));
    expect(await fetchCuratorLeaderboard()).toEqual(rows);
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('first=50');
    expect(url).toContain('skip=0');
  });

  it('fetchCuratorLeaderboard forwards provided first/skip', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchCuratorLeaderboard({ first: 5, skip: 20 });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('first=5');
    expect(url).toContain('skip=20');
  });

  it('fetchCuratorLeaderboard throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchCuratorLeaderboard()).rejects.toThrow('Curator leaderboard failed: 500');
  });

  it('fetchTokenMetrics returns the data array when present and builds count query', async () => {
    const rows = [{ epoch: 1, issuance: 2, totalBurn: 3 }];
    mockFetch.mockResolvedValue(jsonResponse({ data: rows }));
    expect(await fetchTokenMetrics(7)).toEqual(rows);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/token-metrics?count=7');
  });

  it('fetchTokenMetrics throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchTokenMetrics()).rejects.toThrow('Token metrics failed: 500');
  });

  it('fetchDelegationFlows throws with status on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 500));
    await expect(fetchDelegationFlows()).rejects.toThrow('Delegation flows failed: 500');
  });
});

describe('api: fetchWithRetry backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns immediately on first success without delay', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    await expect(fetchWithRetry(fetcher)).resolves.toBe('ok');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries with increasing backoff and eventually succeeds', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('recovered');

    const promise = fetchWithRetry(fetcher, 3, 100);
    // First attempt fails synchronously-ish; advance through both backoffs.
    await vi.advanceTimersByTimeAsync(100); // delay * 1
    await vi.advanceTimersByTimeAsync(200); // delay * 2
    await expect(promise).resolves.toBe('recovered');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('throws the last error after exhausting retries', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('persistent'));
    const promise = fetchWithRetry(fetcher, 2, 50);
    const assertion = expect(promise).rejects.toThrow('persistent');
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
