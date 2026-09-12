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
import type { GrtFlowData } from '@/lib/contracts/grt-flow';
import type { Concentration } from '@/lib/concentration';
import type { ServiceCensus } from '@/lib/service-census';
import type { RequirementsJson } from '@/lib/operator-requirements';
import type { IndexerDetail } from '@/lib/contracts/indexer-detail';
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
  const response = await fetch(`/api/subgraph-deployments?${qs}`);
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
  const response = await fetch('/api/service-census');
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
  const response = await fetch('/api/qos/capture');
  if (!response.ok) throw new Error(`QoS capture failed: ${response.status}`);
  return parseResponse('/api/qos/capture', await response.json(), {
    objects: ['data', 'data.concentration', 'data.coverage'],
    pick: 'data',
  });
}

export async function fetchGrtFlow(): Promise<GrtFlowData> {
  const response = await fetch('/api/grt-flow');
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
  const response = await fetch(`/api/indexer/${encodeURIComponent(address.toLowerCase())}`);
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
  const response = await fetch(`/api/subgraph-history/${encodeURIComponent(hash)}`);
  if (!response.ok) throw new Error(`Subgraph history failed: ${response.status}`);
  return parseResponse('/api/subgraph-history', await response.json(), {
    arrays: ['data.history'],
    pick: 'data',
  });
}

export async function fetchSubgraphVersions(
  hash: string,
): Promise<{ subgraphId: string | null; versions: SubgraphVersion[] }> {
  const response = await fetch(`/api/subgraph-versions/${encodeURIComponent(hash)}`);
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
  const response = await fetch(`/api/indexer-disputes/${encodeURIComponent(address.toLowerCase())}`);
  if (!response.ok) throw new Error(`Indexer disputes failed: ${response.status}`);
  // No envelope on this one, and no disputes is the usual answer.
  return parseResponse('/api/indexer-disputes', await response.json(), {
    arrays: ['disputes'],
    pick: 'disputes',
  });
}

export async function fetchREOStatus(address: string): Promise<REOStatusResponse> {
  const response = await fetch(`/api/reo?address=${encodeURIComponent(address)}`);
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
  const response = await fetch(`/api/delegation-events?${qs}`);
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
  const response = await fetch(`/api/ens?address=${encodeURIComponent(address)}`);
  if (!response.ok) throw new Error(`ENS lookup failed: ${response.status}`);
  return parseResponse('/api/ens', await response.json(), { present: ['ensName'] });
}
