/** What `/api/indexer/[address]/delegators` answers, under `data`: one page, wei as decimal strings. */

export interface ServedDelegator {
  id: string;
  delegator: { id: string };
  shareAmount: string;
  /** What the shares are worth now, at the pool's rate. */
  currentTokens: string;
  /** Everything ever delegated into the position, which `/api/indexer` calls `stakedTokens`. */
  totalDelegatedTokens: string;
  /** Horizon undelegations not yet withdrawn. */
  thawingTokens: string;
  /** Unix seconds, or null when nothing is thawing. */
  thawingUntil: number | null;
  /** Legacy undelegations never withdrawn: withdrawable now, not thawing. */
  lockedTokens: string;
  delegatedAt: number | null;
  lastChangeAt: number | null;
}

export interface IndexerDelegatorsPage {
  delegators: ServedDelegator[];
  /** Every listed position. Null past the end of the list, where no row carries it. */
  total: number | null;
  /** Positions still holding shares. */
  active: number | null;
  pool: { delegatorShares: string; delegatedTokens: string } | null;
}
