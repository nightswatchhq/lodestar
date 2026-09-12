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
  fetchServiceCensus,
  fetchQosCapture,
  fetchGrtFlow,
  fetchIndexerDetail,
  fetchSubgraphHistory,
  fetchSubgraphVersions,
  fetchIndexerDisputes,
  fetchREOStatus,
  fetchDelegationEvents,
  fetchENSName,
  fetchIssueForms,
  fileIssue,
  IssueRejected,
  fetchSqlCatalog,
  runSqlQuery,
  issueSqlReceipt,
  SqlRefused,
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
  // `stakes` and `signals` sit beside the entity rather than inside it, which this fixture did not
  // say and which is exactly what broke both portfolio pages in production.
  portfolio: { data: { delegator: null, curator: null, stakes: [], signals: [] } },
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

  it('passes the deployment hash through as a lookup', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [] }));
    await fetchSubgraphDeployments({ hash: 'Qm/needs+escaping' });
    expect(mockFetch.mock.calls[0][0]).toBe(
      '/api/subgraph-deployments?hash=Qm%2Fneeds%2Bescaping',
    );
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

/**
 * The name is in the payload; the question is whether anything notices when it stops being.
 *
 * `/curate` declared its own row type beside an `as Promise<T>` cast and read the display name down
 * `versions[0].subgraph.metadata.displayName`, a path kittiwake has never sent. A cast is a claim
 * rather than a check, so nothing failed: every row in the Discover table rendered a shortened IPFS
 * hash, and the search box, which filters on the name, matched nothing by name at all. The same
 * file's by-hash lookup read the flat `displayName` and was right, which is how one endpoint ended
 * up rendering two different ways in one component.
 */
describe('subgraph deployments carry a name', () => {
  const row = {
    id: '0xabc',
    ipfsHash: 'Qmbsc6XQWbiv4DfLVfaNciScqYLyDWUYjWzrFBbzzmRsMB',
    signalledTokens: '1',
    stakedTokens: '2',
    queryFeesAmount: '3',
    createdAt: 1758745880,
    displayName: 'uniswap-v4-base-3',
    categories: [],
    curatorSignals: [],
    indexerAllocations: [],
  };

  it('hands back the flat displayName the route sends', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [row] }));
    const [first] = await fetchSubgraphDeployments({ first: 1 });
    expect(first.displayName).toBe('uniswap-v4-base-3');
  });

  it('refuses a row with no displayName rather than letting the table go anonymous', async () => {
    const { displayName: _dropped, ...nameless } = row;
    mockFetch.mockResolvedValue(jsonResponse({ data: [nameless] }));
    await expect(fetchSubgraphDeployments({ first: 1 })).rejects.toThrow('displayName');
  });

  it('refuses the nested shape /curate used to believe in', async () => {
    const { displayName: _dropped, ...nested } = row;
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: [{ ...nested, versions: [{ subgraph: { metadata: { displayName: 'Alpha' } } }] }],
      }),
    );
    await expect(fetchSubgraphDeployments({ first: 1 })).rejects.toThrow('displayName');
  });

  it('accepts a deployment that genuinely has no name', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: [{ ...row, displayName: null }] }));
    const [first] = await fetchSubgraphDeployments({ first: 1 });
    expect(first.displayName).toBeNull();
  });
});

/**
 * The three panels that used to fetch for themselves, each with its own copy of the payload type.
 */
describe('panels that no longer fetch for themselves', () => {
  it('unwraps the census envelope and refuses one with no services', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: { headline: { services: 5 }, benchmark: null, services: [] } }),
    );
    await expect(fetchServiceCensus()).resolves.toMatchObject({ services: [] });

    mockFetch.mockResolvedValue(jsonResponse({ data: { headline: {}, benchmark: null } }));
    await expect(fetchServiceCensus()).rejects.toThrow('data.services');
  });

  it('refuses a QoS capture with no coverage, which is the figure it is divided by', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { concentration: {} } }));
    await expect(fetchQosCapture()).rejects.toThrow('data.coverage');
  });

  it('throws on a bad status instead of parsing the error body as flow data', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'nest busy' }, 503));
    await expect(fetchGrtFlow()).rejects.toThrow('503');
  });

  it('keeps a null supplyBreakdown, which is a real answer when the L1 read fails', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: { supply: 1, issuancePerBlock: 2, supplyBreakdown: null, counts: {}, params: {} },
      }),
    );
    await expect(fetchGrtFlow()).resolves.toMatchObject({ supplyBreakdown: null });
  });
});

/**
 * The nine fetchers lifted out of the hooks and the two indexer pages.
 *
 * All of them checked the status already, which is why the last sweep did not reach them. None of
 * them checked the shape, and several ended `json.data?.x ?? []` - the exact move that turned #114
 * from a page-load into a day, because an empty list is a sentence the UI is happy to render.
 */
describe('the reads that moved out of the hooks', () => {
  it('unwraps the indexer profile from its envelope', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          indexer: {
            id: '0xabc',
            account: { id: '0xabc', defaultDisplayName: null },
            stakedTokens: '1',
            delegatedTokens: '2',
            allocations: [],
            delegators: [],
          },
        },
      }),
    );
    await expect(fetchIndexerDetail('0xABC')).resolves.toMatchObject({ id: '0xabc' });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/indexer/0xabc');
  });

  it('treats a null indexer as an answer, because an unstaked address is one', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { indexer: null } }));
    await expect(fetchIndexerDetail('0xabc')).resolves.toBeNull();
  });

  it('refuses a body with no data at all', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'nest busy' }));
    await expect(fetchIndexerDetail('0xabc')).rejects.toThrow('data');
  });

  it('keeps a deployment nobody published, which has a null subgraph and no versions', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { subgraphId: null, versions: [] } }));
    await expect(fetchSubgraphVersions('QmX')).resolves.toEqual({ subgraphId: null, versions: [] });
  });

  it('refuses a versions body that lost its list', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { subgraphId: 'a' } }));
    await expect(fetchSubgraphVersions('QmX')).rejects.toThrow('data.versions');
  });

  it('reads the history list out of its envelope', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: { history: [{ date: '2026-01-01', signalGrt: 1, stakeGrt: 2 }] } }),
    );
    await expect(fetchSubgraphHistory('QmX')).resolves.toMatchObject({ history: [{ signalGrt: 1 }] });
  });

  it('hands back disputes as a bare list and lowercases the address', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ disputes: [] }));
    await expect(fetchIndexerDisputes('0xABCDEF')).resolves.toEqual([]);
    expect(mockFetch.mock.calls[0][0]).toBe('/api/indexer-disputes/0xabcdef');
  });

  it('refuses a disputes body with no list, rather than reporting a clean record', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'unavailable' }));
    await expect(fetchIndexerDisputes('0xabc')).rejects.toThrow('disputes');
  });

  it('requires the REO reading to say whether the oracle is stale', async () => {
    // An eligibility answer from an oracle that stopped updating is not an eligibility answer, and
    // this hook returned `res.json()` untyped, so nothing anywhere asserted the field existed.
    mockFetch.mockResolvedValue(jsonResponse({ status: { status: 'eligible' } }));
    await expect(fetchREOStatus('0xabc')).rejects.toThrow('oracleStale');

    mockFetch.mockResolvedValue(
      jsonResponse({ status: { status: 'eligible', oracleStale: false } }),
    );
    await expect(fetchREOStatus('0xabc')).resolves.toMatchObject({
      status: { status: 'eligible' },
    });
  });

  it('refuses a delegation-events body with no list, rather than drawing an empty feed', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { events: [] } }));
    await expect(fetchDelegationEvents({ first: 50 })).rejects.toThrow('data.delegationEvents');
  });

  it('carries the source through so the panel can say which backend answered', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ data: { delegationEvents: [{ id: 'e1' }], source: 'nuthatch' } }),
    );
    await expect(fetchDelegationEvents({ indexer: '0xabc', first: 100 })).resolves.toEqual({
      events: [{ id: 'e1' }],
      source: 'nuthatch',
    });
    expect(mockFetch.mock.calls[0][0]).toBe('/api/delegation-events?first=100&indexer=0xabc');
  });

  it('throws on a failed ENS lookup instead of answering "no name"', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'resolver down' }, 502));
    await expect(fetchENSName('0xabc')).rejects.toThrow('502');
  });

  it('keeps a null ENS name, which is the answer for an address without one', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ensName: null }));
    await expect(fetchENSName('0xabc')).resolves.toEqual({ ensName: null });
  });
});

describe('filing a support issue', () => {
  it('keeps canFile false, which is what the live deployment says', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ templates: [], canFile: false, chooserUrl: 'https://x' }),
    );
    await expect(fetchIssueForms()).resolves.toMatchObject({ canFile: false });
  });

  it('refuses a forms body with no templates, which the composer maps over', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ canFile: true }));
    await expect(fetchIssueForms()).rejects.toThrow('templates');
  });

  it('carries every unanswered field back at once', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ errors: ['Steps to reproduce is required', 'Version is required'] }, 422),
    );
    const err = await fileIssue({ template: 't', title: 'x', values: {}, website: '' }).catch((e) => e);
    expect(err).toBeInstanceOf(IssueRejected);
    expect((err as IssueRejected).reasons).toHaveLength(2);
  });

  /**
   * A 200 with no number is not a filed issue. Without the check the page renders "Filed as #" and
   * links to `/support/undefined` - a confirmation of something that did not happen, on the one
   * screen whose entire job is confirming that it did.
   */
  it('refuses a success that carries no issue number', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(
      fileIssue({ template: 't', title: 'x', values: {}, website: '' }),
    ).rejects.toThrow('number');
  });

  it('hands back the number and url when one lands', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ number: 141, url: 'https://github.com/x/141' }));
    await expect(fileIssue({ template: 't', title: 'x', values: {}, website: '' })).resolves.toEqual(
      { number: 141, url: 'https://github.com/x/141' },
    );
  });
});

describe('the SQL tier', () => {
  /**
   * A 503 here is the route saying this deployment has no SQL tier, with `available: false` in the
   * body to say it in words. Treating it as an error would turn a deliberate answer into a page
   * that looks broken.
   */
  it('lets a 503 through, because that is how the route says there is no tier', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ available: false, datasets: [] }, 503));
    await expect(fetchSqlCatalog()).resolves.toMatchObject({ available: false });
  });

  it('does not let any other bad status through', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'nope' }, 500));
    await expect(fetchSqlCatalog()).rejects.toThrow('500');
  });

  /**
   * `degraded` and `truncated` are the two flags the results table draws a warning from. A body
   * without them renders as a complete, undegraded answer - which is the one thing a query tool
   * must not claim on its own authority.
   */
  it('refuses a result that does not say whether it is complete', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ rows: [], count: 0, truncated: false }));
    await expect(runSqlQuery('d', 'SELECT 1')).rejects.toThrow('degraded');
  });

  it('carries the route\'s own words back when a query is refused', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'no such table: factoryz' }, 400));
    const err = await runSqlQuery('d', 'SELECT 1').catch((e) => e);
    expect(err).toBeInstanceOf(SqlRefused);
    expect(err.message).toBe('no such table: factoryz');
  });

  /**
   * The one that matters most on this page.
   *
   * The caller writes whatever comes back to a file called `receipt-….json` and hands it to
   * somebody. So a 200 carrying anything at all became a receipt as far as the download was
   * concerned - and a file with no signature in it is not a receipt, it is a JSON document that
   * `/verify` will refuse weeks later with nothing to say why.
   */
  it('refuses to call an unsigned answer a receipt', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ body: { result_hash: '0xabc' }, rows: [], pubkey: 'k' }),
    );
    await expect(issueSqlReceipt('q', {})).rejects.toThrow('signature');

    mockFetch.mockResolvedValue(
      jsonResponse({ body: { result_hash: '0xabc' }, rows: [], signature: 's' }),
    );
    await expect(issueSqlReceipt('q', {})).rejects.toThrow('pubkey');
  });

  /**
   * A receipt names the public half of the key that signed it, and the verifier checks against
   * that rather than one it has memorised. That is what let the issuer key be rotated on
   * 12 September without invalidating anything already in circulation, so `pubkey` travelling
   * with the signature is load-bearing rather than decorative.
   */
  it('hands back a receipt that carries its own key', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        body: { result_hash: '0xabc', row_count: 0, dataset: 'd', query: 'SELECT 1' },
        rows: [],
        pubkey: 'bd3b3313',
        signature: 'sig',
      }),
    );
    await expect(issueSqlReceipt('q', {})).resolves.toMatchObject({ pubkey: 'bd3b3313' });
  });
});

/**
 * Both portfolio pages rendered an error boundary for every address that had a position.
 *
 * `/delegators/…` threw `stakes is not iterable` and `/curators/…` threw `Cannot read properties of
 * undefined (reading 'map')`. Both worked for an address with nothing, because the page returns
 * early on a null entity before it reaches the iteration - so every fixture and every sweep subject
 * exercised the one path through those pages that works.
 */
describe('a portfolio with anything in it', () => {
  it('refuses a delegator body with no stakes array, where the page iterates one', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { delegator: { id: '0xa' } } }));
    await expect(fetchDelegatorPortfolio('0xa')).rejects.toThrow('data.stakes');
  });

  it('refuses a curator body with no signals array', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { curator: { id: '0xa' } } }));
    await expect(fetchCuratorPortfolio('0xa')).rejects.toThrow('data.signals');
  });

  it('hands the page a delegator it can iterate', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          delegator: { id: '0xa', total_staked_tokens: '100', stakes_count: 1 },
          stakes: [{ id: 's1', staked_tokens: '100', indexer: '0xix', indexing_reward_cut: '430000' }],
        },
      }),
    );
    const { delegator } = await fetchDelegatorPortfolio('0xa');
    expect(delegator?.stakes).toHaveLength(1);
    expect(delegator?.totalStakedTokens).toBe('100');
    expect(delegator?.stakes[0].indexer.indexingRewardCut).toBe(430000);
  });

  it('hands the page a curator it can map over', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        data: {
          curator: { id: '0xa', total_signalled_tokens: '9900' },
          signals: [{ id: 'g1', signal: '9900', subgraph_deployment: '0xdep' }],
        },
      }),
    );
    const { curator } = await fetchCuratorPortfolio('0xa');
    expect(curator?.signals.map((s) => s.signal)).toEqual(['9900']);
    expect(curator?.totalSignalledTokens).toBe('9900');
  });

  it('still answers null for an address that has never done either', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { delegator: null, stakes: [] } }));
    await expect(fetchDelegatorPortfolio('0xa')).resolves.toEqual({ delegator: null });
  });
});
