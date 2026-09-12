import {
  type NetworkStatsResponse,
  type EpochHistoryResponse,
  type IndexersResponse,
  type IndexerProvisionsResponse,
  type DelegatorPortfolioResponse,
  type CuratorPortfolioResponse,
  type PaymentsOverview,
} from './queries';
import { normaliseEnrichedResponse, type EnrichedResponse } from './enriched-normalise';
import {
  normaliseDelegatorPortfolio,
  normaliseCuratorPortfolio,
} from './portfolio-normalise';
import { parseResponse } from './contract';
import { apiUrl } from './api-origin';
import { fetchShedAware } from './shed';
import type { ManifestAnalysis } from './manifest';
import type { POIOverview, POIDeploymentDetail } from './poi';
import type { DeploymentIndexingStatus } from './indexing-status-shape';
import type { DeveloperActivityResponse } from '@/lib/contracts/developer-activity';
import type { ActivityEvent } from '@/lib/contracts/horizon-activity';
import type { DipsAllocation, DipsStep } from '@/lib/contracts/dips';
import type { Agreement, AgreementStatus } from '@/lib/dips-agreements';
import type { GrtFlowData } from '@/lib/contracts/grt-flow';
import type { Concentration } from '@/lib/concentration';
import type { ServiceCensus } from '@/lib/service-census';
import type { RequirementsJson } from '@/lib/operator-requirements';
import type { IndexerDetail } from '@/lib/contracts/indexer-detail';
import type {
  SubgraphSearchAnswer,
  SubgraphSearchResult,
} from '@/lib/contracts/subgraph-search';
import type { IndexerRevenue, IndexerPnl } from '@/lib/contracts/indexer-pnl';
import type { DisassemblyReport } from '@/lib/disassembly/types';
import type { DisassemblyDiff } from '@/lib/disassembly/diff';
import type { RecommendResponse } from '@/lib/contracts/delegate-recommend';
import type { EnrichedIndexer } from '@/lib/enriched';
import type { SupportArchive } from '@/lib/graph-support';
import type { IssueForm } from '@/lib/issue-form';
import type {
  SqlCatalog,
  QueryResult,
  NamedQueryDef,
  NamedResult,
  Receipt,
} from '@/lib/contracts/sql';
import { summariseNodeHealth } from '@/lib/node-health';
import type { NodeHealthResponse, NodeSyncSummary } from '@/lib/node-health';
import type {
  DelegationEvent,
  IndexerDispute,
  REOStatusResponse,
  SubgraphHistoryPoint,
  SubgraphVersion,
} from '@/lib/contracts/indexer-signals';

/** What `/api/dips` answers. `available: false` when the contracts are not configured. */
export interface DipsStatusResponse {
  available: boolean;
  totalRate?: number;
  agreementRate?: number;
  live?: boolean;
  allocations?: DipsAllocation[];
  timeline?: DipsStep[];
  lastConfiguredAt?: number | null;
}

/** What `/api/dips/agreements` answers. */
export interface DipsAgreementsResponse {
  available: boolean;
  empty?: boolean;
  agreements?: Agreement[];
  counts?: Record<AgreementStatus, number>;
  totalCollectedGrt?: number;
}

/**
 * Fetch network statistics via cached GET endpoint
 */
export async function fetchNetworkStats(): Promise<NetworkStatsResponse> {
  const response = await fetchShedAware(apiUrl('/api/network-stats'));
  if (!response.ok) throw new Error(`Network stats failed: ${response.status}`);
  // `grtSupply` is optional in the declared type and legitimately absent when the on-chain read
  // fails, so it is not asserted. `graphNetwork` is what every caller destructures.
  return parseResponse('/api/network-stats', await response.json(), {
    objects: ['data', 'data.graphNetwork'],
    present: ['data.graphNetwork.currentEpoch', 'data.graphNetwork.totalTokensStaked'],
    pick: 'data',
  });
}

/**
 * Fetch epoch history via cached GET endpoint
 */
export async function fetchEpochHistory(count = 30): Promise<EpochHistoryResponse> {
  const response = await fetchShedAware(apiUrl(`/api/epochs?count=${count}`));
  if (!response.ok) throw new Error(`Epoch history failed: ${response.status}`);
  return parseResponse('/api/epochs', await response.json(), {
    objects: ['data'],
    rows: { 'data.epoches': ['id'] },
    pick: 'data',
  });
}

/**
 * Fetch indexers via cached GET endpoint
 */
export async function fetchIndexers(params: {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}): Promise<IndexersResponse> {
  const {
    first = 25,
    skip = 0,
    orderBy = 'stakedTokens',
    orderDirection = 'desc',
  } = params;

  const qs = new URLSearchParams({
    first: String(first),
    skip: String(skip),
    orderBy,
    orderDirection,
  });

  const response = await fetchShedAware(apiUrl(`/api/indexers?${qs}`));
  if (!response.ok) throw new Error(`Indexers failed: ${response.status}`);
  return parseResponse('/api/indexers', await response.json(), {
    objects: ['data'],
    rows: { 'data.indexers': ['id', 'stakedTokens', 'indexingRewardCut'] },
    pick: 'data',
  });
}

/**
 * Fetch enriched indexers (pre-computed by cron job)
 */
export async function fetchEnrichedIndexers(): Promise<EnrichedResponse> {
  const response = await fetchShedAware(apiUrl('/api/indexers-enriched'));
  if (!response.ok) throw new Error('Enriched data not available');
  // Parsed, not cast. The previous version declared this return type and handed back
  // `response.json()` unchecked, so a contract change on the server was invisible to the compiler
  // and to every test - which is exactly how #114 rendered a table of dashes for a day.
  return normaliseEnrichedResponse(await response.json());
}

/**
 * Fetch GRT price from proxy
 */
export async function fetchGRTPrice(): Promise<{
  price: number;
  change24h: number;
}> {
  const response = await fetchShedAware(apiUrl('/api/price'));
  if (!response.ok) throw new Error('Failed to fetch GRT price');
  // Both keys are asserted present rather than numeric: when every upstream fails the route answers
  // `{ price: null, change24h: null }`, which the declared type does not admit but the callers
  // already render as unavailable. Tightening that is a route change, not a parser change.
  return parseResponse('/api/price', await response.json(), {
    present: ['price', 'change24h'],
  });
}

/**
 * Fetch TVL from DefiLlama proxy
 */
export async function fetchTVL(): Promise<{
  tvl: number;
}> {
  const response = await fetchShedAware(apiUrl('/api/tvl'));
  if (!response.ok) throw new Error('Failed to fetch TVL');
  return parseResponse('/api/tvl', await response.json(), { present: ['tvl'] });
}

/**
 * Fetch provisions for a specific indexer via cached GET endpoint
 */
export async function fetchIndexerProvisions(indexer: string): Promise<IndexerProvisionsResponse> {
  const response = await fetchShedAware(apiUrl(`/api/provisions?indexer=${encodeURIComponent(indexer)}`));
  if (!response.ok) throw new Error(`Indexer provisions failed: ${response.status}`);
  // An indexer with no provisions answers `{ data: { provisions: [] } }`, which is correct.
  return parseResponse('/api/provisions', await response.json(), {
    objects: ['data'],
    arrays: ['data.provisions'],
    pick: 'data',
  });
}

/**
 * Fetch delegator portfolio via cached GET endpoint
 */
export async function fetchDelegatorPortfolio(address: string): Promise<DelegatorPortfolioResponse> {
  const response = await fetchShedAware(apiUrl(`/api/portfolio?address=${encodeURIComponent(address)}&type=delegator`));
  if (!response.ok) throw new Error(`Delegator portfolio failed: ${response.status}`);
  // `delegator` is `Delegator | null` - an address that has never delegated is a null, not a fault.
  // `stakes` sits beside it rather than inside it, which is the whole reason `portfolio-normalise`
  // exists: asserting only `data.delegator` let a payload through that made the page throw.
  const body = parseResponse<{ delegator: Record<string, unknown> | null; stakes: unknown[] }>(
    '/api/portfolio?type=delegator',
    await response.json(),
    { objects: ['data'], present: ['data.delegator'], arrays: ['data.stakes'], pick: 'data' },
  );
  return normaliseDelegatorPortfolio(body);
}

/**
 * Fetch curator portfolio via cached GET endpoint
 */
export async function fetchCuratorPortfolio(address: string): Promise<CuratorPortfolioResponse> {
  const response = await fetchShedAware(apiUrl(`/api/portfolio?address=${encodeURIComponent(address)}&type=curator`));
  if (!response.ok) throw new Error(`Curator portfolio failed: ${response.status}`);
  // `curator` is `Curator | null`, same as the delegator side.
  const body = parseResponse<{ curator: Record<string, unknown> | null; signals: unknown[] }>(
    '/api/portfolio?type=curator',
    await response.json(),
    { objects: ['data'], present: ['data.curator'], arrays: ['data.signals'], pick: 'data' },
  );
  return normaliseCuratorPortfolio(body);
}

/**
 * Fetch subgraph deployments via GET endpoint
 */
export interface SubgraphDeployment {
  id: string;
  ipfsHash: string;
  signalledTokens: string;
  stakedTokens: string;
  queryFeesAmount: string;
  createdAt: number;
  indexerAllocations: { id: string }[];
  curatorSignals: { id: string }[];
  /** Flat, as kittiwake sends it. It is not nested under `versions[0].subgraph.metadata`. */
  displayName: string | null;
  categories: string[];
}

export async function fetchSubgraphDeployments(params: {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  /** Exact IPFS hash. The route answers with the one deployment, or none. */
  hash?: string;
} = {}): Promise<SubgraphDeployment[]> {
  const qs = new URLSearchParams();
  if (params.first) qs.set('first', String(params.first));
  if (params.skip) qs.set('skip', String(params.skip));
  if (params.orderBy) qs.set('orderBy', params.orderBy);
  if (params.orderDirection) qs.set('orderDirection', params.orderDirection);
  if (params.hash) qs.set('hash', params.hash);
  const response = await fetchShedAware(apiUrl(`/api/subgraph-deployments?${qs}`));
  if (!response.ok) throw new Error(`Deployments fetch failed: ${response.status}`);
  return parseResponse('/api/subgraph-deployments', await response.json(), {
    // `displayName` is load-bearing and easy to lose: `/curate` read it down a `versions[0]`
    // path the route has never sent, and rendered a shortened hash for every row instead. If it
    // stops arriving, this should say so rather than let the table quietly go anonymous again.
    rows: { data: ['id', 'ipfsHash', 'signalledTokens', 'stakedTokens', 'displayName'] },
    pick: 'data',
  });
}

/**
 * Fetch subgraph deployments with 30-day query fees
 */
export async function fetchSubgraphDeployments30d(): Promise<{
  id: string;
  ipfsHash: string;
  signalledTokens: string;
  stakedTokens: string;
  queryFeesAmount: string;
  queryFees30d: string;
  createdAt: number;
  indexerAllocations: { id: string }[];
  curatorSignals: { id: string }[];
  displayName: string | null;
  categories: string[];
}[]> {
  const response = await fetchShedAware(apiUrl('/api/subgraph-fees-30d'));
  if (!response.ok) throw new Error(`30d fees fetch failed: ${response.status}`);
  // `queryFees30d` is the whole point of this route as distinct from the one above, so a row
  // without it is a contract change however healthy the rest of the payload looks.
  return parseResponse('/api/subgraph-fees-30d', await response.json(), {
    rows: { data: ['id', 'ipfsHash', 'queryFees30d'] },
    pick: 'data',
  });
}

/**
 * Fetch manifest complexity analysis for an IPFS hash
 */
export async function fetchManifestAnalysis(hash: string): Promise<ManifestAnalysis> {
  const response = await fetchShedAware(apiUrl(`/api/manifest?hash=${encodeURIComponent(hash)}`));
  if (!response.ok) throw new Error(`Manifest analysis failed: ${response.status}`);
  return parseResponse('/api/manifest', await response.json(), {
    objects: ['data'],
    arrays: ['data.dataSources', 'data.breakdown'],
    present: ['data.score', 'data.network'],
    pick: 'data',
  });
}

/**
 * Fetch POI consensus overview
 */
export async function fetchPOIOverview(): Promise<POIOverview> {
  const response = await fetchShedAware(apiUrl('/api/poi'));
  if (!response.ok) throw new Error(`POI overview failed: ${response.status}`);
  return parseResponse('/api/poi', await response.json(), {
    objects: ['data', 'data.summary'],
    arrays: ['data.deployments'],
    present: ['data.summary.overallConsensusRate'],
    pick: 'data',
  });
}

/**
 * Fetch POI detail for a specific deployment
 */
export async function fetchPOIDeployment(deployment: string): Promise<POIDeploymentDetail> {
  const response = await fetchShedAware(apiUrl(`/api/poi?deployment=${encodeURIComponent(deployment)}`));
  if (!response.ok) throw new Error(`POI detail failed: ${response.status}`);
  return parseResponse('/api/poi?deployment', await response.json(), {
    objects: ['data'],
    arrays: ['data.epochs'],
    present: ['data.deploymentId', 'data.ipfsHash'],
    pick: 'data',
  });
}

/**
 * Fetch indexing status for a subgraph deployment
 */
export async function fetchIndexingStatus(hash: string): Promise<DeploymentIndexingStatus> {
  const response = await fetchShedAware(apiUrl(`/api/indexing-status/${encodeURIComponent(hash)}`));
  if (!response.ok) throw new Error(`Indexing status failed: ${response.status}`);
  // A deployment nobody has allocated to answers `{ indexers: [] }`, which is a real answer.
  return parseResponse('/api/indexing-status', await response.json(), {
    objects: ['data'],
    arrays: ['data.indexers'],
    present: ['data.deploymentId'],
    pick: 'data',
  });
}

/**
 * Fetch indexing status for all deployments of a specific indexer
 */
export async function fetchIndexerStatus(address: string): Promise<{
  indexerAddress: string;
  indexerUrl: string | null;
  totalAllocations: number;
  syncedCount: number;
  syncingCount: number;
  failedCount: number;
  unreachableCount: number;
  deployments: Array<{
    deploymentId: string;
    ipfsHash: string;
    displayName: string | null;
    allocatedTokens: string;
    signalledTokens: string;
    stakedTokens: string;
    createdAtEpoch: number;
    status: 'synced' | 'syncing' | 'failed' | 'unreachable';
    health?: 'healthy' | 'unhealthy' | 'failed';
    network?: string;
    chainHeadBlock?: number;
    latestBlock?: number;
    blocksBehind?: number;
    syncProgress?: number;
    entityCount?: string;
    fatalError?: string;
  }>;
}> {
  const response = await fetchShedAware(apiUrl(`/api/indexer-status/${encodeURIComponent(address)}`));
  if (!response.ok) throw new Error(`Indexer status failed: ${response.status}`);
  return parseResponse('/api/indexer-status', await response.json(), {
    objects: ['data'],
    arrays: ['data.deployments'],
    present: ['data.indexerAddress'],
    pick: 'data',
  });
}

/**
 * Fetch per-chain sync health, including whether each chain's head is still
 * advancing at all. See lib/chain-liveness.
 */
export async function fetchChainLag(): Promise<{
  data: import('@/lib/chain-lag').ChainLagData | null;
}> {
  const response = await fetchShedAware(apiUrl('/api/chain-lag'));
  if (!response.ok) throw new Error('Failed to fetch chain lag');
  // The envelope is returned whole here, and `data` is explicitly nullable in the declared type, so
  // this asserts the key exists rather than what is under it.
  return parseResponse('/api/chain-lag', await response.json(), { present: ['data'] });
}

/**
 * Fetch rewards accrual history for a delegator address
 */
export async function fetchRewardsHistory(
  address: string,
  days = 90
): Promise<{
  history: Array<{
    date: string;
    timestamp: number;
    value: number;
    rewards: number;
    principal: number;
  }>;
}> {
  const qs = new URLSearchParams({ address, days: String(days) });
  const response = await fetchShedAware(apiUrl(`/api/rewards-history?${qs}`));
  if (!response.ok) throw new Error(`Rewards history failed: ${response.status}`);
  // An address with no rewards legitimately answers `{ history: [] }`. Rejecting empty results is
  // what produced four false alarms the first time the e2e contracts ran; presence is not fullness.
  return parseResponse('/api/rewards-history', await response.json(), {
    rows: { history: ['date', 'timestamp', 'value', 'rewards', 'principal'] },
  });
}

/**
 * Fetch network-wide payment pipeline overview
 */
export async function fetchPayments(): Promise<PaymentsOverview> {
  const response = await fetchShedAware(apiUrl('/api/payments'));
  if (!response.ok) throw new Error(`Payments failed: ${response.status}`);
  return parseResponse('/api/payments', await response.json(), {
    objects: ['data'],
    arrays: ['data.escrowAccounts', 'data.recentTransactions'],
    present: ['data.totalCollected', 'data.activePayers'],
    pick: 'data',
  });
}

/**
 * Fetch payment data for a specific indexer (receiver)
 */
export async function fetchIndexerPayments(receiver: string): Promise<PaymentsOverview> {
  const response = await fetchShedAware(apiUrl(`/api/payments?receiver=${encodeURIComponent(receiver)}`));
  if (!response.ok) throw new Error(`Indexer payments failed: ${response.status}`);
  return parseResponse('/api/payments?receiver', await response.json(), {
    objects: ['data'],
    arrays: ['data.escrowAccounts', 'data.recentTransactions'],
    present: ['data.totalCollected', 'data.activePayers'],
    pick: 'data',
  });
}

/**
 * Fetch 26-week stake history for an indexer (time-travel snapshots)
 */
export async function fetchIndexerStakeHistory(
  address: string
): Promise<{ history: Array<{ date: string; selfStakeGrt: number; delegatedGrt: number }> }> {
  const response = await fetchShedAware(apiUrl(`/api/indexer-stake-history/${encodeURIComponent(address)}`));
  if (!response.ok) throw new Error(`Stake history failed: ${response.status}`);
  return parseResponse('/api/indexer-stake-history', await response.json(), {
    objects: ['data'],
    rows: { 'data.history': ['date', 'selfStakeGrt', 'delegatedGrt'] },
    pick: 'data',
  });
}

/**
 * Generic fetch with error handling
 */
export async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let i = 0; i < retries; i++) {
    try {
      return await fetcher();
    } catch (error) {
      lastError = error as Error;
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }

  throw lastError;
}

/**
 * Fetch per-epoch token issuance and burn metrics
 */
export async function fetchTokenMetrics(count = 100): Promise<{
  epoch: number;
  issuance: number;
  queryFeeTaxBurn: number;
  disputeBurn: number;
  totalBurn: number;
  net: number;
}[]> {
  const response = await fetchShedAware(apiUrl(`/api/token-metrics?count=${count}`));
  if (!response.ok) throw new Error(`Token metrics failed: ${response.status}`);
  // The `?? []` this replaces was a silent fallback to an empty chart. Every success path on the
  // route sends `data`, so its absence is a contract change and should say so.
  return parseResponse('/api/token-metrics', await response.json(), {
    rows: { data: ['epoch', 'issuance', 'totalBurn'] },
    pick: 'data',
  });
}

/**
 * Fetch developer-activity timeseries (subgraphs published per week)
 */
export async function fetchDeveloperActivity(): Promise<DeveloperActivityResponse> {
  const response = await fetchShedAware(apiUrl('/api/developer-activity'));
  if (!response.ok) throw new Error(`Developer activity failed: ${response.status}`);
  return parseResponse('/api/developer-activity', await response.json(), {
    objects: ['data'],
    arrays: ['data.weeks'],
    present: ['data.totalInWindow', 'data.windowMonths'],
    pick: 'data',
  });
}

/**
 * Fetch network-wide delegation inflows/outflows aggregated by day
 */
export async function fetchDelegationFlows(days = 90, compare = false): Promise<{
  date: string;
  inflows: number;
  outflows: number;
  net: number;
}[]> {
  const response = await fetchShedAware(apiUrl(`/api/delegation-flows?days=${days}${compare ? '&compare=1' : ''}`));
  if (!response.ok) throw new Error(`Delegation flows failed: ${response.status}`);
  // Another `?? []` removed: the route always sends `data` on success, so an empty chart should be
  // an empty array from the server, never a missing key swallowed here.
  return parseResponse('/api/delegation-flows', await response.json(), {
    rows: { data: ['date', 'inflows', 'outflows', 'net'] },
    pick: 'data',
  });
}

export async function fetchParameterHistory(address: string): Promise<{
  param_name: string;
  old_value: number | null;
  new_value: number;
  epoch: number | null;
  detected_at: string;
}[]> {
  const response = await fetchShedAware(apiUrl(`/api/parameter-history/${encodeURIComponent(address)}`));
  if (!response.ok) throw new Error(`Parameter history failed: ${response.status}`);
  // An indexer that has never changed a parameter answers `{ data: [] }` from the route itself, so
  // the empty case needs no fallback here and the missing case is a genuine fault.
  return parseResponse('/api/parameter-history', await response.json(), {
    rows: { data: ['param_name', 'new_value', 'detected_at'] },
    pick: 'data',
  });
}

export interface ProvenanceEvent {
  kind: 'delegation' | 'undelegation' | 'withdrawal' | 'reward_cut' | 'query_fee_cut';
  timestamp: string;
  tokensGRT?: number;
  delegator?: string;
  delegatorName?: string | null;
  oldValue?: number | null;
  newValue?: number;
}

export interface PoolReconciliation {
  verified: boolean;
  driftGRT: number;
  driftPct: number;
  chain: { tokens: number; thawing: number; active: number };
  subgraph: { tokens: number; thawing: number; active: number };
}

export interface AprProvenance {
  reconcile: PoolReconciliation | null;
  events: ProvenanceEvent[];
}

export async function fetchAprProvenance(address: string): Promise<AprProvenance> {
  const response = await fetchShedAware(apiUrl(`/api/apr-provenance/${encodeURIComponent(address)}`));
  if (!response.ok) throw new Error(`APR provenance failed: ${response.status}`);
  // `reconcile` is legitimately null when the pool could not be read on-chain, and `events` is
  // legitimately empty. The fallback this replaces made a missing payload indistinguishable from
  // both of those, which is the shape of failure #114 took.
  return parseResponse('/api/apr-provenance', await response.json(), {
    objects: ['data'],
    arrays: ['data.events'],
    present: ['data.reconcile'],
    pick: 'data',
  });
}

export interface CuratorSignalEntry {
  id: string;
  curatorAddress: string;
  signalledTokens: string;
  unsignalledTokens: string;
  signal: string;
  lastSignalChange: number;
  realizedRewards: string;
}

export interface SubgraphCurationData {
  signals: CuratorSignalEntry[];
  totalSignalledTokens: string;
  queryFeesAmount: string;
}

export async function fetchSubgraphCuration(hash: string): Promise<SubgraphCurationData> {
  const response = await fetchShedAware(apiUrl(`/api/subgraph-curation/${encodeURIComponent(hash)}`));
  if (!response.ok) throw new Error(`Subgraph curation failed: ${response.status}`);
  return parseResponse('/api/subgraph-curation', await response.json(), {
    objects: ['data'],
    arrays: ['data.signals'],
    present: ['data.totalSignalledTokens', 'data.queryFeesAmount'],
    pick: 'data',
  });
}

export async function fetchSubgraphSchema(hash: string): Promise<{ schemaText: string; schemaHash: string }> {
  const response = await fetchShedAware(apiUrl(`/api/subgraph-schema/${encodeURIComponent(hash)}`));
  if (!response.ok) throw new Error(`Schema fetch failed: ${response.status}`);
  return parseResponse('/api/subgraph-schema', await response.json(), {
    objects: ['data'],
    present: ['data.schemaText', 'data.schemaHash'],
    pick: 'data',
  });
}

export async function fetchCuratorLeaderboard(params: { first?: number; skip?: number } = {}): Promise<
  import('@/lib/contracts/curators').CuratorLeaderboardEntry[]
> {
  const { first = 50, skip = 0 } = params;
  const qs = new URLSearchParams({ first: String(first), skip: String(skip) });
  const response = await fetchShedAware(apiUrl(`/api/curators?${qs}`));
  if (!response.ok) throw new Error(`Curator leaderboard failed: ${response.status}`);
  return parseResponse('/api/curators', await response.json(), {
    rows: { data: ['id'] },
    pick: 'data',
  });
}

// ── Panels that used to fetch for themselves ─────────────────────────────────
//
// Three components called `fetch(apiUrl('/api/…')).then((r) => r.json())` inline, with no status check
// between them. A 500 became the error envelope parsed as data, `available` came back undefined,
// and the panel returned null: the read failed and the page showed nothing, with nothing anywhere
// saying so. `failed-reads-are-not-answers` exists to catch that and its pattern only matched the
// `const r = await fetch(…)` form, so this shape walked past it.

/** `available: false` is a real answer here: the DIPS contracts may simply not be configured. */
export async function fetchDipsStatus(): Promise<DipsStatusResponse> {
  const response = await fetchShedAware(apiUrl('/api/dips'));
  if (!response.ok) throw new Error(`DIPS status failed: ${response.status}`);
  return parseResponse('/api/dips', await response.json(), {
    objects: ['data'],
    present: ['data.available'],
    pick: 'data',
  });
}

export async function fetchDipsAgreements(): Promise<DipsAgreementsResponse> {
  const response = await fetchShedAware(apiUrl('/api/dips/agreements'));
  if (!response.ok) throw new Error(`DIPS agreements failed: ${response.status}`);
  return parseResponse('/api/dips/agreements', await response.json(), {
    objects: ['data'],
    present: ['data.available'],
    pick: 'data',
  });
}

export async function fetchHorizonActivity(limit = 25): Promise<ActivityEvent[]> {
  const response = await fetchShedAware(apiUrl(`/api/horizon/activity?limit=${limit}`));
  if (!response.ok) throw new Error(`Horizon activity failed: ${response.status}`);
  return parseResponse('/api/horizon/activity', await response.json(), {
    arrays: ['data'],
    pick: 'data',
  });
}

// ── More panels that used to fetch for themselves ────────────────────────────
//
// Same reason as the block above, and the same class of defect turned up doing it. Each of these
// had its response shape written out again at the call site, as an inline `as Promise<T>` cast on
// `res.json()`. A cast is a claim, not a check: nothing compares it against what the route sends,
// so two call sites in one file believed different things about the same payload and only one of
// them was right. `/curate` read `displayName` down a `versions[0].subgraph.metadata` path that
// kittiwake has never sent, so every row in the Discover table rendered a shortened IPFS hash
// instead of the name sitting in the body, and searching by name matched nothing.

/** The provider census, read from the registries on Arbitrum One and then actually called. */
export interface ServiceCensusResponse {
  headline: {
    services: number;
    withAnyProvider: number;
    withAnyServing: number;
    registered: number;
    serving: number;
  };
  benchmark: RequirementsJson | null;
  services: ServiceCensus[];
}

/**
 * One census read for the whole page.
 *
 * `ProviderCensus` and `RegistryVsReality` both sat on the query key `['service-census']` with a
 * fetcher and a payload type each. TanStack dedupes the request by key, so whichever mounted first
 * decided what the other one got, and the two declared types had already drifted: one of them knew
 * about the `refused` verdict and the other rendered it as an empty column.
 */
export async function fetchServiceCensus(): Promise<ServiceCensusResponse> {
  const response = await fetchShedAware(apiUrl('/api/service-census'));
  if (!response.ok) throw new Error(`Service census failed: ${response.status}`);
  return parseResponse('/api/service-census', await response.json(), {
    objects: ['data', 'data.headline'],
    arrays: ['data.services'],
    pick: 'data',
  });
}

/** How concentrated query serving is, and over how much of the allocated set it was measured. */
export interface QosCapture {
  concentration: Concentration;
  coverage: { allocated_indexers: number; measured_indexers: number };
}

export async function fetchQosCapture(): Promise<QosCapture> {
  const response = await fetchShedAware(apiUrl('/api/qos/capture'));
  if (!response.ok) throw new Error(`QoS capture failed: ${response.status}`);
  return parseResponse('/api/qos/capture', await response.json(), {
    objects: ['data', 'data.concentration', 'data.coverage'],
    pick: 'data',
  });
}

export async function fetchGrtFlow(): Promise<GrtFlowData> {
  const response = await fetchShedAware(apiUrl('/api/grt-flow'));
  if (!response.ok) throw new Error(`GRT flow failed: ${response.status}`);
  // `supplyBreakdown` is legitimately null when the L1 read fails, so it is not asserted; `counts`
  // and `params` are what every figure on the page is divided by.
  return parseResponse('/api/grt-flow', await response.json(), {
    objects: ['data', 'data.counts', 'data.params'],
    present: ['data.supply', 'data.issuancePerBlock'],
    pick: 'data',
  });
}

// ── The hooks that used to fetch for themselves ──────────────────────────────
//
// Seven inline fetchers lived in `useNetworkStats.ts` and two more, identical and separately
// written, in the two indexer pages. All of them checked the status, which is why they were not in
// the last sweep; none of them checked the shape, which is the failure #114 actually was. Several
// ended `json.data?.x ?? []`, so a 200 carrying a renamed field rendered as "nothing happened"
// rather than as a contract change.

export async function fetchIndexerDetail(address: string): Promise<IndexerDetail | null> {
  const response = await fetchShedAware(apiUrl(`/api/indexer/${encodeURIComponent(address.toLowerCase())}`));
  if (!response.ok) throw new Error(`Indexer detail failed: ${response.status}`);
  const body = await response.json();
  // An address nobody has staked against is a real answer, and the route says so with a null
  // indexer rather than a 404. Only a body with no `data` at all is a broken contract.
  if (body?.data?.indexer == null) {
    // Validate the envelope, then answer null: a body with no `data` is a broken contract, and a
    // `data` carrying a null indexer is the route saying nobody has staked at this address.
    parseResponse('/api/indexer', body, { present: ['data'] });
    return null;
  }
  return parseResponse('/api/indexer', body, {
    objects: ['data', 'data.indexer', 'data.indexer.account'],
    arrays: ['data.indexer.allocations', 'data.indexer.delegators'],
    present: ['data.indexer.stakedTokens', 'data.indexer.delegatedTokens'],
    pick: 'data.indexer',
  });
}

export async function fetchSubgraphHistory(
  hash: string,
): Promise<{ history: SubgraphHistoryPoint[] }> {
  const response = await fetchShedAware(apiUrl(`/api/subgraph-history/${encodeURIComponent(hash)}`));
  if (!response.ok) throw new Error(`Subgraph history failed: ${response.status}`);
  return parseResponse('/api/subgraph-history', await response.json(), {
    arrays: ['data.history'],
    pick: 'data',
  });
}

export async function fetchSubgraphVersions(
  hash: string,
): Promise<{ subgraphId: string | null; versions: SubgraphVersion[] }> {
  const response = await fetchShedAware(apiUrl(`/api/subgraph-versions/${encodeURIComponent(hash)}`));
  if (!response.ok) throw new Error(`Subgraph versions failed: ${response.status}`);
  // A deployment nobody published through the GNS has a null `subgraphId` and no versions, which
  // is an ordinary answer: assert the key is there, not that it has anything in it.
  return parseResponse('/api/subgraph-versions', await response.json(), {
    present: ['data.subgraphId'],
    arrays: ['data.versions'],
    pick: 'data',
  });
}

export async function fetchIndexerDisputes(address: string): Promise<IndexerDispute[]> {
  const response = await fetchShedAware(apiUrl(`/api/indexer-disputes/${encodeURIComponent(address.toLowerCase())}`));
  if (!response.ok) throw new Error(`Indexer disputes failed: ${response.status}`);
  // No envelope on this one, and no disputes is the usual answer.
  return parseResponse('/api/indexer-disputes', await response.json(), {
    arrays: ['disputes'],
    pick: 'disputes',
  });
}

export async function fetchREOStatus(address: string): Promise<REOStatusResponse> {
  const response = await fetchShedAware(apiUrl(`/api/reo?address=${encodeURIComponent(address)}`));
  if (!response.ok) throw new Error(`REO status failed: ${response.status}`);
  // `status.status` carries "unknown" when the oracle has nothing for this address, so the object
  // must be there even though its contents may say nothing useful.
  return parseResponse('/api/reo', await response.json(), {
    objects: ['status'],
    present: ['status.status', 'status.oracleStale'],
  });
}

export async function fetchDelegationEvents(params: {
  indexer?: string;
  first?: number;
}): Promise<{ events: DelegationEvent[]; source?: 'nuthatch' | 'subgraph' }> {
  const qs = new URLSearchParams({ first: String(params.first ?? 50) });
  if (params.indexer) qs.set('indexer', params.indexer);
  const response = await fetchShedAware(apiUrl(`/api/delegation-events?${qs}`));
  if (!response.ok) throw new Error(`Delegation events failed: ${response.status}`);
  // This used to end `json.data?.delegationEvents ?? []`, so a renamed field drew an empty
  // activity feed - "nobody has delegated" - from a route that had answered perfectly well.
  const body = parseResponse<{ delegationEvents: DelegationEvent[]; source?: string }>(
    '/api/delegation-events',
    await response.json(),
    { arrays: ['data.delegationEvents'], pick: 'data' },
  );
  return {
    events: body.delegationEvents,
    source: body.source as 'nuthatch' | 'subgraph' | undefined,
  };
}

/**
 * An ENS name, or null because there is not one.
 *
 * It throws on a failed lookup rather than answering null. Both render the same thing - callers
 * fall back to the shortened address either way - but only one of them can tell you the resolver
 * has been down for a week.
 */
export async function fetchENSName(address: string): Promise<{ ensName: string | null }> {
  const response = await fetchShedAware(apiUrl(`/api/ens?address=${encodeURIComponent(address)}`));
  if (!response.ok) throw new Error(`ENS lookup failed: ${response.status}`);
  return parseResponse('/api/ens', await response.json(), { present: ['ensName'] });
}

// ── The last of the reads that built their own requests ──────────────────────

/**
 * Search subgraphs by name.
 *
 * One fetcher for three call sites. The disassembly picker, `/subgraphs` and `/indexing` each had
 * their own, and only the picker checked the status: without that a 500 becomes `json.data ?? []`,
 * TanStack records a success, and the panel says the search found nothing.
 */
export async function fetchSubgraphSearch(q: string): Promise<SubgraphSearchAnswer> {
  const response = await fetchShedAware(apiUrl(`/api/subgraph-search?q=${encodeURIComponent(q)}`));
  if (!response.ok) throw new Error(`Subgraph search failed: ${response.status}`);
  const body = parseResponse<{ data: SubgraphSearchResult[]; warmBacklog?: unknown }>(
    '/api/subgraph-search',
    await response.json(),
    { arrays: ['data'] },
  );
  return {
    hits: body.data,
    warmBacklog: typeof body.warmBacklog === 'number' ? body.warmBacklog : null,
  };
}

export async function fetchDisassembly(id: string): Promise<DisassemblyReport> {
  const response = await fetchShedAware(apiUrl(`/api/disassembly?id=${encodeURIComponent(id)}`));
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // The route explains itself on a 4xx - an unknown hash, a manifest it could not fetch - and
    // that sentence is worth more to a reader than the status code on its own.
    throw new Error(body?.error ?? `Disassembly failed: ${response.status}`);
  }
  return parseResponse('/api/disassembly', body, {
    objects: ['data', 'data.manifest', 'data.scorecard'],
    arrays: ['data.dataSources'],
    pick: 'data',
  });
}

export async function fetchDisassemblyDiff(
  a: string,
  b: string,
): Promise<{ diff: DisassemblyDiff; base: DisassemblyReport; target: DisassemblyReport }> {
  const response = await fetchShedAware(apiUrl(`/api/disassembly/diff?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Disassembly diff failed: ${response.status}`);
  return parseResponse('/api/disassembly/diff', body, {
    objects: ['data', 'data.diff', 'data.base', 'data.target'],
    pick: 'data',
  });
}

/** Chains an indexer has stopped serving, keyed by indexer address. */
export async function fetchDroppedChains(): Promise<Record<string, string[]>> {
  const response = await fetchShedAware(apiUrl('/api/dropped-chains'));
  if (!response.ok) throw new Error(`Dropped chains failed: ${response.status}`);
  return parseResponse('/api/dropped-chains', await response.json(), {
    objects: ['data'],
    pick: 'data',
  });
}

export async function fetchIndexerRevenue(
  address: string,
  windowDays: number,
): Promise<IndexerRevenue> {
  const response = await fetchShedAware(apiUrl(`/api/indexer/${encodeURIComponent(address)}/revenue?window=${windowDays}`),
  );
  if (!response.ok) throw new Error(`Indexer revenue failed: ${response.status}`);
  return parseResponse('/api/indexer/revenue', await response.json(), {
    objects: ['data'],
    arrays: ['data.daily'],
    present: ['data.total_grt'],
    pick: 'data',
  });
}

export async function fetchIndexerPnl(
  address: string,
  params: { windowDays: number; grtPrice?: number; chain?: string },
): Promise<IndexerPnl> {
  const qs = new URLSearchParams({ window: String(params.windowDays) });
  if (params.grtPrice != null) qs.set('price', String(params.grtPrice));
  if (params.chain) qs.set('chain', params.chain);
  const response = await fetchShedAware(apiUrl(`/api/indexer/${encodeURIComponent(address)}/pnl?${qs}`));
  if (!response.ok) throw new Error(`Indexer P&L failed: ${response.status}`);
  // `net_usd` is the headline and it is a subtraction: a missing `infra_cost_usd` would render a
  // loss-making indexer as profitable rather than as unknown.
  return parseResponse('/api/indexer/pnl', await response.json(), {
    objects: ['data', 'data.pnl', 'data.costModel', 'data.defaultChainCosts'],
    present: ['data.pnl.revenue_usd', 'data.pnl.infra_cost_usd', 'data.pnl.net_usd'],
    pick: 'data',
  });
}

/**
 * Two candidate indexers for a delegation, or the single best one.
 *
 * Same route, two shapes, decided by `count`: without it the route answers one recommendation at
 * the top level, with it a list under `candidates`.
 */
export async function fetchDelegateRecommendation(prefs: {
  returns: number;
  stability: number;
  safety: number;
  network: number;
}): Promise<RecommendResponse> {
  const response = await fetchShedAware(apiUrl(`/api/delegate/recommend?${new URLSearchParams(
    Object.fromEntries(Object.entries(prefs).map(([k, v]) => [k, String(v)])),
  )}`));
  if (!response.ok) throw new Error(await response.text());
  return parseResponse('/api/delegate/recommend', await response.json(), {
    objects: ['indexer'],
    arrays: ['reasons'],
    present: ['score'],
  });
}

export async function fetchDelegateCandidates(
  prefs: { returns: number; stability: number; safety: number; network: number },
  count: number,
): Promise<{ candidates: Array<{ indexer: EnrichedIndexer; score: number; reasons: string[] }> }> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(prefs).map(([k, v]) => [k, String(v)])),
  );
  qs.set('count', String(count));
  const response = await fetchShedAware(apiUrl(`/api/delegate/recommend?${qs}`));
  if (!response.ok) throw new Error(await response.text());
  return parseResponse('/api/delegate/recommend', await response.json(), {
    arrays: ['candidates'],
  });
}

/**
 * The graph-support archive.
 *
 * No `refetchInterval` at the hook: the route caches for fifteen minutes and the write-ups do not
 * move, so polling would only spend GitHub's rate limit.
 */
export async function fetchGraphSupport(): Promise<SupportArchive> {
  const response = await fetchShedAware(apiUrl('/api/support'));
  if (!response.ok) {
    // The route answers 503 with a reason rather than an empty archive, so surface it.
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `graph-support fetch failed: ${response.status}`);
  }
  return parseResponse('/api/support', await response.json(), {
    arrays: ['issues'],
    present: ['fetchedAt'],
  });
}

/**
 * One indexer node's status endpoint, summarised.
 *
 * The raw body is one row per deployment and there were 4,889 of them on the node this was found
 * on, so the summary is what crosses into the component rather than the list.
 */
export async function fetchNodeHealth(
  url: string,
  address: string,
): Promise<NodeSyncSummary> {
  const response = await fetchShedAware(apiUrl(`/api/indexer-node-health?url=${encodeURIComponent(url)}&addr=${encodeURIComponent(address)}`),
  );
  if (!response.ok) throw new Error(`Node health failed: ${response.status}`);
  const body = parseResponse<NodeHealthResponse>('/api/indexer-node-health', await response.json(), {
    objects: ['data'],
    present: ['data.reachable'],
    pick: 'data',
  });
  return summariseNodeHealth(body);
}

// ── Filing a support issue ───────────────────────────────────────────────────

/** The templates the composer offers, and whether it can file at all. */
export interface IssueFormsResponse {
  templates: IssueForm[];
  canFile: boolean;
  chooserUrl: string;
}

export async function fetchIssueForms(): Promise<IssueFormsResponse> {
  const response = await fetchShedAware(apiUrl('/api/issue-forms'));
  if (!response.ok) throw new Error('The issue forms could not be read.');
  // `canFile: false` is a real answer - it is what the route says when no token is configured, and
  // it is what the live deployment says today. `templates` missing is not: the composer maps over
  // it, and an absent list would take the page down rather than fall back to the links.
  return parseResponse('/api/issue-forms', await response.json(), {
    arrays: ['templates'],
    present: ['canFile'],
  });
}

/** What the route answers when an issue lands. */
export interface FiledIssue {
  number: number;
  url: string;
}

/** Thrown when the route refuses the submission and says which fields it wants. */
export class IssueRejected extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons[0] ?? 'The issue could not be filed.');
    this.name = 'IssueRejected';
  }
}

export async function fileIssue(body: {
  template: string;
  title: string;
  values: Record<string, unknown>;
  handle?: string;
  website: string;
}): Promise<FiledIssue> {
  const response = await fetchShedAware(apiUrl('/api/file-issue'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const answered = await response.json().catch(() => null);

  if (!response.ok) {
    // Every unanswered field at once. One at a time would mean a round trip per field.
    const all = Array.isArray(answered?.errors)
      ? answered.errors.filter((e: unknown): e is string => typeof e === 'string')
      : [];
    throw new IssueRejected(
      all.length > 0
        ? all
        : [typeof answered?.error === 'string' ? answered.error : 'The issue could not be filed.'],
    );
  }

  // A 200 with no number is not a filed issue. Without this the page renders "Filed as #" and
  // links to `/support/undefined`, which is a confirmation of something that did not happen.
  return parseResponse('/api/file-issue', answered, { present: ['number', 'url'] });
}

// ── The SQL tier ─────────────────────────────────────────────────────────────

/**
 * The dataset catalogue.
 *
 * A 503 is not an error here: it is how the route says this deployment has no SQL tier, and the
 * body carries `available: false` to say so in words. Every other bad status is.
 */
export async function fetchSqlCatalog(): Promise<SqlCatalog> {
  const response = await fetchShedAware(apiUrl('/api/sql/catalog'));
  if (!response.ok && response.status !== 503) {
    throw new Error(`SQL catalog failed: ${response.status}`);
  }
  return parseResponse('/api/sql/catalog', await response.json(), {
    present: ['available'],
    arrays: ['datasets'],
  });
}

/** Thrown when a query is refused, carrying what the route said about it. */
export class SqlRefused extends Error {}

export async function runSqlQuery(dataset: string, q: string): Promise<QueryResult> {
  const response = await fetchShedAware(apiUrl('/api/sql/query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataset, q }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SqlRefused(body?.error ?? `Request failed (${response.status}).`);
  }
  // `degraded` and `truncated` are the two flags the table renders a warning from. A body missing
  // them reads as a complete, undegraded answer, which is the one thing a query tool must not
  // claim on its own authority.
  return parseResponse('/api/sql/query', body, {
    arrays: ['rows'],
    present: ['count', 'truncated', 'degraded'],
  });
}

export async function fetchNamedQueries(): Promise<{ queries: NamedQueryDef[] }> {
  const response = await fetchShedAware(apiUrl('/api/sql/named'));
  if (!response.ok) throw new Error(`Named queries failed: ${response.status}`);
  return parseResponse('/api/sql/named', await response.json(), { arrays: ['queries'] });
}

export async function runNamedQuery(
  name: string,
  args: Record<string, string>,
): Promise<NamedResult> {
  const response = await fetchShedAware(apiUrl('/api/sql/named'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SqlRefused(body?.error ?? `Request failed (${response.status}).`);
  }
  return parseResponse('/api/sql/named', body, {
    arrays: ['rows'],
    present: ['count', 'sql'],
  });
}

/**
 * A signed receipt for a named query.
 *
 * The check matters more here than anywhere else on this page. The caller writes whatever comes
 * back to a file called `receipt-….json` and hands it to somebody, so a 200 carrying anything at
 * all became a receipt as far as the download was concerned. A file with no signature in it is not
 * a receipt; it is a JSON document that will be refused by `/verify` weeks later, with nothing to
 * say why. Assert the three things a verifier needs before calling it one.
 */
export async function issueSqlReceipt(
  name: string,
  args: Record<string, string>,
): Promise<Receipt> {
  const response = await fetchShedAware(apiUrl('/api/sql/receipt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SqlRefused(body?.error ?? `Request failed (${response.status}).`);
  }
  return parseResponse('/api/sql/receipt', body, {
    objects: ['body'],
    arrays: ['rows'],
    present: ['signature', 'pubkey', 'body.result_hash'],
  });
}
