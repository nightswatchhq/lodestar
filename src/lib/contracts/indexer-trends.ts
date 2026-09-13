/** What `/api/indexer/[address]/trends` answers: two lists, newest first, wei as decimal strings. */

export interface RewardDailyAgg {
  /** Microseconds at the UTC day's start, as the retired subgraph's `Timestamp` carried it. */
  timestamp: string;
  indexer: string;
  totalRewards: string;
  totalIndexerRewards: string;
  totalDelegationRewards: string;
  rewardCount: string;
}

export interface QueryFeeDailyAgg {
  timestamp: string;
  indexer: string;
  /** Gross: before the curators' share and the protocol's cut. */
  totalCollected: string;
  totalCurators: string;
  /** Null for the era whose events never stated it. */
  totalProtocolTax: string | null;
  /** What the indexer kept. */
  totalCollectedNet: string;
  feeCount: string;
}

export interface IndexerTrendsResponse {
  rewards: RewardDailyAgg[];
  queryFees: QueryFeeDailyAgg[];
}
