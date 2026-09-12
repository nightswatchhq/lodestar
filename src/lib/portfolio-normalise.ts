import type { Curator, Delegator, DelegatedStake, Signal } from './queries';

/**
 * `/api/portfolio` answers in a different shape from the one both portfolio pages read.
 *
 * ## What this cost
 *
 * `/delegators/[address]` and `/curators/[address]` rendered an **error boundary** - thirty
 * characters, "Something went wrong" - for every address that actually had a position. Both worked
 * perfectly for an address with none, because the page returns early on a null entity before it
 * reaches the iteration that throws.
 *
 *   /delegators/…  TypeError: stakes is not iterable
 *   /curators/…    TypeError: Cannot read properties of undefined (reading 'map')
 *
 * Three differences, and each one alone is enough:
 *
 * 1. **The collection is hoisted.** kittiwake sends `{ delegator, stakes }`; the page reads
 *    `delegator.stakes`.
 * 2. **Keys are snake_case.** `total_staked_tokens` against `totalStakedTokens`, and twenty more.
 * 3. **The indexer is flattened.** A stake carries `indexer`, `indexer_staked_tokens`,
 *    `indexer_delegated_tokens` and so on as sibling fields; the page reads a nested
 *    `stake.indexer.stakedTokens`.
 *
 * ## Why a normaliser rather than changing the pages
 *
 * Same answer as `enriched-normalise`, which exists for the same reason after #114: the translation
 * belongs in one tested place rather than spread over two pages and the six components they hand
 * these objects to. The declared types in `queries.ts` stay the contract the app is written
 * against, and this is the only thing that has to know what the wire looks like.
 *
 * ## Why the contract check did not catch it
 *
 * `fetchDelegatorPortfolio` asserted `data.delegator` was present, and it was. It never asserted
 * the array the page iterates, because the declared type said that array lived inside `delegator`
 * and nothing compares a declared type to a payload. The contracts below assert the collections
 * where they actually are.
 */

/** Wei and ppm arrive as strings; a few are numbers and one is null. Read them without guessing. */
function str(row: Record<string, unknown>, key: string, fallback = '0'): string {
  const v = row[key];
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return fallback;
}

function num(row: Record<string, unknown>, key: string, fallback = 0): number {
  const v = row[key];
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

/** One delegated position, with the indexer's fields gathered back up into an indexer. */
export function normaliseStake(row: Record<string, unknown>): DelegatedStake {
  const indexerId = str(row, 'indexer', '');
  return {
    id: str(row, 'id', ''),
    stakedTokens: str(row, 'staked_tokens'),
    shareAmount: str(row, 'share_amount'),
    lockedTokens: str(row, 'locked_tokens'),
    lockedUntil: num(row, 'locked_until'),
    realizedRewards: str(row, 'realized_rewards'),
    unstakedTokens: str(row, 'unstaked_tokens'),
    createdAt: num(row, 'created_at'),
    // Null is the answer for a position never undelegated from, and it is not the same as zero:
    // the page renders a date from it.
    lastUndelegatedAt: row.last_undelegated_at == null ? null : num(row, 'last_undelegated_at'),
    indexer: {
      id: indexerId,
      // The portfolio route carries no display name or metadata. The page falls back to the
      // address, which is what it did before this existed.
      account: { id: indexerId },
      stakedTokens: str(row, 'indexer_staked_tokens'),
      delegatedTokens: str(row, 'indexer_delegated_tokens'),
      delegatedThawingTokens: str(row, 'indexer_delegated_thawing_tokens'),
      delegatorShares: str(row, 'indexer_delegator_shares'),
      // ppm, and it arrives as a string. `Number("430000")` rather than the string, or every
      // reward-cut percentage on the page renders as NaN.
      indexingRewardCut: num(row, 'indexing_reward_cut'),
      queryFeeCut: num(row, 'query_fee_cut'),
      delegatorParameterCooldown: num(row, 'delegator_parameter_cooldown'),
      allocationCount: num(row, 'allocation_count'),
    },
  };
}

export function normaliseDelegatorPortfolio(body: {
  delegator: Record<string, unknown> | null;
  stakes?: unknown;
}): { delegator: Delegator | null } {
  if (!body.delegator) return { delegator: null };
  const d = body.delegator;
  const stakes = Array.isArray(body.stakes) ? body.stakes : [];
  return {
    delegator: {
      id: str(d, 'id', ''),
      totalStakedTokens: str(d, 'total_staked_tokens'),
      totalUnstakedTokens: str(d, 'total_unstaked_tokens'),
      totalRealizedRewards: str(d, 'total_realized_rewards'),
      // Counted from the rows rather than trusting the summary, so the header and the table below
      // it cannot disagree about how many positions there are.
      stakesCount: num(d, 'stakes_count', stakes.length),
      activeStakesCount: num(d, 'active_stakes_count', stakes.filter((s) => s?.active).length),
      stakes: stakes.map((s) => normaliseStake(s as Record<string, unknown>)),
    },
  };
}

export function normaliseSignal(row: Record<string, unknown>): Signal {
  const deployment = str(row, 'subgraph_deployment', '');
  return {
    id: str(row, 'id', ''),
    signalledTokens: str(row, 'signalled_tokens'),
    unsignalledTokens: str(row, 'unsignalled_tokens'),
    signal: str(row, 'signal'),
    lastSignalChange: num(row, 'last_signal_change'),
    realizedRewards: str(row, 'realized_rewards'),
    subgraphDeployment: {
      id: deployment,
      // The route sends the bytes32 id and no IPFS hash. The page links on `ipfsHash`, so an
      // invented one would be a link to nothing; the id is what it has.
      ipfsHash: str(row, 'subgraph_deployment_ipfs_hash', deployment),
      signalledTokens: str(row, 'deployment_signalled_tokens'),
      queryFeesAmount: str(row, 'deployment_query_fees_amount'),
      stakedTokens: str(row, 'deployment_staked_tokens'),
    },
  };
}

export function normaliseCuratorPortfolio(body: {
  curator: Record<string, unknown> | null;
  signals?: unknown;
}): { curator: Curator | null } {
  if (!body.curator) return { curator: null };
  const c = body.curator;
  const signals = Array.isArray(body.signals) ? body.signals : [];
  return {
    curator: {
      id: str(c, 'id', ''),
      totalSignalledTokens: str(c, 'total_signalled_tokens'),
      totalUnsignalledTokens: str(c, 'total_unsignalled_tokens'),
      // Name signal and withdrawals are not in this route's answer. Zero rather than absent,
      // because the page does arithmetic on them.
      totalNameSignalledTokens: str(c, 'total_name_signalled_tokens'),
      totalNameUnsignalledTokens: str(c, 'total_name_unsignalled_tokens'),
      totalWithdrawnTokens: str(c, 'total_withdrawn_tokens'),
      realizedRewards: str(c, 'realized_rewards'),
      signalCount: num(c, 'signal_count', signals.length),
      activeSignalCount: num(c, 'active_signal_count', signals.length),
      signals: signals.map((s) => normaliseSignal(s as Record<string, unknown>)),
    },
  };
}
