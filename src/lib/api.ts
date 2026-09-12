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
import { parseResponse } from './contract';
import type { ManifestAnalysis } from './manifest';
import type { POIOverview, POIDeploymentDetail } from './poi';
import type { DeploymentIndexingStatus } from './indexing-status-shape';
import type { DeveloperActivityResponse } from '@/lib/contracts/developer-activity';
import type { ActivityEvent } from '@/lib/contracts/horizon-activity';
import type { DipsAllocation, DipsStep } from '@/lib/contracts/dips';
import type { Agreement, AgreementStatus } from '@/lib/dips-agreements';

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
  const response = await fetch('/api/network-stats');
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
  const response = await fetch(`/api/epochs?count=${count}`);
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

  const response = await fetch(`/api/indexers?${qs}`);
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
  const response = await fetch('/api/indexers-enriched');
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
  const response = await fetch('/api/price');
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
  const response = await fetch('/api/tvl');
  if (!response.ok) throw new Error('Failed to fetch TVL');
  return parseResponse('/api/tvl', await response.json(), { present: ['tvl'] });
}

/**
 * Fetch provisions for a specific indexer via cached GET endpoint
 */
export async function fetchIndexerProvisions(indexer: string): Promise<IndexerProvisionsResponse> {
  const response = await fetch(`/api/provisions?indexer=${encodeURIComponent(indexer)}`);
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
  const response = await fetch(`/api/portfolio?address=${encodeURIComponent(address)}&type=delegator`);
  if (!response.ok) throw new Error(`Delegator portfolio failed: ${response.status}`);
  // `delegator` is `Delegator | null` - an address that has never delegated is a null, not a fault.
  return parseResponse('/api/portfolio?type=delegator', await response.json(), {
    objects: ['data'],
    present: ['data.delegator'],
    pick: 'data',
  });
}

/**
 * Fetch curator portfolio via cached GET endpoint
 */
export async function fetchCuratorPortfolio(address: string): Promise<CuratorPortfolioResponse> {
  const response = await fetch(`/api/portfolio?address=${encodeURIComponent(address)}&type=curator`);
  if (!response.ok) throw new Error(`Curator portfolio failed: ${response.status}`);
  // `curator` is `Curator | null`, same as the delegator side.
  return parseResponse('/api/portfolio?type=curator', await response.json(), {
    objects: ['data'],
    present: ['data.curator'],
    pick: 'data',
  });
}

/**
 * Fetch subgraph deployments via GET endpoint
 */
export async function fetchSubgraphDeployments(params: {
  first?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
} = {}): Promise<{
  id: string;
  ipfsHash: string;
  signalledTokens: string;
  stakedTokens: string;
  queryFeesAmount: string;
  createdAt: number;
  indexerAllocations: { id: string }[];
  curatorSignals: { id: string }[];
  displayName: string | null;
  categories: string[];
}[]> {
  const qs = new URLSearchParams();
  if (params.first) qs.set('first', String(params.first));
  if (params.skip) qs.set('skip', String(params.skip));
  if (params.orderBy) qs.set('orderBy', params.orderBy);
  if (params.orderDirection) qs.set('orderDirection', params.orderDirection);
  const response = await fetch(`/api/subgraph-deployments?${qs}`);
  if (!response.ok) throw new Error(`Deployments fetch failed: ${response.status}`);
  return parseResponse('/api/subgraph-deployments', await response.json(), {
    rows: { data: ['id', 'ipfsHash', 'signalledTokens', 'stakedTokens'] },
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
  const response = await fetch('/api/subgraph-fees-30d');
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
  const response = await fetch(`/api/manifest?hash=${encodeURIComponent(hash)}`);
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
  const response = await fetch('/api/poi');
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
  const response = await fetch(`/api/poi?deployment=${encodeURIComponent(deployment)}`);
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
  const response = await fetch(`/api/indexing-status/${encodeURIComponent(hash)}`);
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
  const response = await fetch(`/api/indexer-status/${encodeURIComponent(address)}`);
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
  const response = await fetch('/api/chain-lag');
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
  const response = await fetch(`/api/rewards-history?${qs}`);
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
  const response = await fetch('/api/payments');
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
  const response = await fetch(`/api/payments?receiver=${encodeURIComponent(receiver)}`);
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
  const response = await fetch(`/api/indexer-stake-history/${encodeURIComponent(address)}`);
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
  const response = await fetch(`/api/token-metrics?count=${count}`);
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
  const response = await fetch('/api/developer-activity');
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
  const response = await fetch(`/api/delegation-flows?days=${days}${compare ? '&compare=1' : ''}`);
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
  const response = await fetch(`/api/parameter-history/${encodeURIComponent(address)}`);
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
  const response = await fetch(`/api/apr-provenance/${encodeURIComponent(address)}`);
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
  const response = await fetch(`/api/subgraph-curation/${encodeURIComponent(hash)}`);
  if (!response.ok) throw new Error(`Subgraph curation failed: ${response.status}`);
  return parseResponse('/api/subgraph-curation', await response.json(), {
    objects: ['data'],
    arrays: ['data.signals'],
    present: ['data.totalSignalledTokens', 'data.queryFeesAmount'],
    pick: 'data',
  });
}

export async function fetchSubgraphSchema(hash: string): Promise<{ schemaText: string; schemaHash: string }> {
  const response = await fetch(`/api/subgraph-schema/${encodeURIComponent(hash)}`);
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
  const response = await fetch(`/api/curators?${qs}`);
  if (!response.ok) throw new Error(`Curator leaderboard failed: ${response.status}`);
  return parseResponse('/api/curators', await response.json(), {
    rows: { data: ['id'] },
    pick: 'data',
  });
}

// ── Panels that used to fetch for themselves ─────────────────────────────────
//
// Three components called `fetch('/api/…').then((r) => r.json())` inline, with no status check
// between them. A 500 became the error envelope parsed as data, `available` came back undefined,
// and the panel returned null: the read failed and the page showed nothing, with nothing anywhere
// saying so. `failed-reads-are-not-answers` exists to catch that and its pattern only matched the
// `const r = await fetch(…)` form, so this shape walked past it.

/** `available: false` is a real answer here: the DIPS contracts may simply not be configured. */
export async function fetchDipsStatus(): Promise<DipsStatusResponse> {
  const response = await fetch('/api/dips');
  if (!response.ok) throw new Error(`DIPS status failed: ${response.status}`);
  return parseResponse('/api/dips', await response.json(), {
    objects: ['data'],
    present: ['data.available'],
    pick: 'data',
  });
}

export async function fetchDipsAgreements(): Promise<DipsAgreementsResponse> {
  const response = await fetch('/api/dips/agreements');
  if (!response.ok) throw new Error(`DIPS agreements failed: ${response.status}`);
  return parseResponse('/api/dips/agreements', await response.json(), {
    objects: ['data'],
    present: ['data.available'],
    pick: 'data',
  });
}

export async function fetchHorizonActivity(limit = 25): Promise<ActivityEvent[]> {
  const response = await fetch(`/api/horizon/activity?limit=${limit}`);
  if (!response.ok) throw new Error(`Horizon activity failed: ${response.status}`);
  return parseResponse('/api/horizon/activity', await response.json(), {
    arrays: ['data'],
    pick: 'data',
  });
}
