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
  deniedSince?: number | null;
}

export interface ActiveAllocation {
  id: string;
  allocatedTokens: string;
  createdAtEpoch: number;
  subgraphDeployment: AllocationDeployment;
  /**
   * Wei a POI would collect now, before cuts (kittiwake#162). Null where the chain read failed for
   * this row; absent where kittiwake did not read it at all.
   */
  pendingRewards?: string | null;
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
  /** Delegators still holding shares. Absent from a kittiwake older than #163. */
  delegatorCount?: number | null;
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
  // Absent when kittiwake could not read them, which is not the same as empty.
  allocations?: ActiveAllocation[];
  closedAllocations?: ClosedAllocation[];
  /** The block and unix time the cached pending-rewards read was taken at. */
  pendingRewardsBlock?: number | null;
  pendingRewardsAt?: number | null;
  delegators?: Array<{
    id: string;
    stakedTokens: string;
    shareAmount: string;
    delegator: { id: string };
  }>;
  /** Lifted from `data.degraded`, which sits beside the indexer rather than inside it. */
  degraded?: DegradedPart[];
}

/**
 * The sections kittiwake#153 may leave out rather than fail the page; the indexer's own row and the
 * delegation ratio are still required. `operators` is spelled as `degraded` spells it, not as
 * `account.operators`.
 */
export const MISSABLE_SECTIONS = ['operators', 'delegators', 'allocations', 'closedAllocations'] as const;

export type MissableSection = (typeof MISSABLE_SECTIONS)[number];

/** A section the route could not read: the field it would have filled, and the nest's own code. */
export interface DegradedPart {
  part: string;
  reason: string;
}

/** kittiwake's reason codes in words. An unfamiliar code is carried through rather than flattened. */
const REASONS: Record<string, string> = {
  nest_upstream: 'The nest it is read from refused the read.',
  nest_busy: 'The nest it is read from was too busy to answer.',
  nest_timeout: 'The nest it is read from did not answer in time.',
  nest_unready: 'The nest it is read from is still catching up.',
  nest_decode: 'The nest answered with something this page could not read.',
};

/** Why the named section is absent. Always a sentence, including when nothing named it. */
export function whyMissing(indexer: { degraded?: DegradedPart[] }, part: MissableSection): string {
  const named = indexer.degraded?.find((d) => d.part === part);
  if (!named) return 'The answer did not say why.';
  return REASONS[named.reason] ?? `The nest it is read from would not answer (${named.reason}).`;
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
