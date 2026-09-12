/**
 * What `/api/indexer/[address]` answers, under `data.indexer`.
 *
 * There were two of these: one in the profile page and a narrower one in the delegate page, each
 * with its own `useIndexerDetails` hook and its own inline fetch, both on the query key
 * `['indexerDetails', address]`. TanStack dedupes by key, so the two hooks were already sharing one
 * cached object while disagreeing on paper about what was in it. One type, one fetcher.
 */

/** The deployment an allocation points at. */
export interface AllocationDeployment {
  id: string;
  ipfsHash: string;
  signalledTokens: string;
  stakedTokens: string;
  /**
   * Flat, as kittiwake sends it. Null means nobody has named the subgraph, and the row falls back
   * to the hash. It used to be read out of `versions[0].subgraph.metadata.displayName`, a shape the
   * route filled with an empty array and never populated: see kittiwake#128.
   */
  displayName: string | null;
}

export interface ActiveAllocation {
  id: string;
  allocatedTokens: string;
  createdAtEpoch: number;
  subgraphDeployment: AllocationDeployment;
}

export interface IndexerDetail {
  id: string;
  account: {
    id: string;
    defaultDisplayName: string | null;
    operators?: { id: string }[] | null;
    metadata?: {
      displayName?: string | null;
      description?: string | null;
      website?: string | null;
    } | null;
  };
  stakedTokens: string;
  lockedTokens?: string;
  delegatedTokens: string;
  delegatedThawingTokens?: string;
  allocatedTokens: string;
  tokenCapacity: string;
  allocationCount: number;
  indexingRewardCut: number;
  queryFeeCut: number;
  rewardsEarned: string;
  queryFeesCollected: string;
  delegatorShares: string;
  delegatorParameterCooldown: number;
  lastDelegationParameterUpdate: number;
  url: string | null;
  geoHash: string | null;
  createdAt: number;
  // Horizon metrics
  indexingRewardEffectiveCut?: string;
  overDelegationDilution?: string;
  ownStakeRatio?: string;
  delegatedStakeRatio?: string;
  indexerRewardsOwnGenerationRatio?: string;
  provisionedTokens?: string;
  allocations: ActiveAllocation[];
  closedAllocations?: ClosedAllocation[];
  delegators: Array<{
    id: string;
    stakedTokens: string;
    shareAmount: string;
    delegator: { id: string };
  }>;
}

export interface ClosedAllocation {
  id: string;
  allocatedTokens: string;
  createdAtEpoch: number;
  closedAtEpoch: number | null;
  closedAt: number | null;
  indexingRewards: string;
  queryFeesCollected: string;
  poi: string | null;
  forceClosed: boolean;
  subgraphDeployment: {
    id: string;
    ipfsHash: string;
    displayName: string | null;
  };
}
