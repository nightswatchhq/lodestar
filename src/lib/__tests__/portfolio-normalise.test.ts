import { describe, expect, it } from 'vitest';

import {
  normaliseCuratorPortfolio,
  normaliseDelegatorPortfolio,
  normaliseStake,
  normaliseSignal,
} from '../portfolio-normalise';

/**
 * The fixtures are real answers from `/api/portfolio`, trimmed but not reshaped.
 *
 * That matters more than usual here. Both portfolio pages rendered an error boundary in production
 * for every address with a position, and the reason nothing caught it is that every fixture and
 * every sweep subject was an address with none: the pages return early on a null entity, so they
 * were only ever exercised down the path that works.
 */

const STAKE = {
  active: true,
  allocation_count: 1952,
  created_at: 1789185857,
  current_tokens: '30509549564143291334656',
  geohash: 'f25dyhdh2',
  id: '0xa244…-0xf92f…',
  indexer: '0xf92f430dd8567b0d466358c79594ab58d919a6d4',
  indexer_delegated_thawing_tokens: '23112206223053546128785393',
  indexer_delegated_tokens: '166737621941497215885063976',
  indexer_delegator_shares: '69389273052978902981955919',
  indexer_staked_tokens: '12800862233516110598314665',
  indexing_reward_cut: '430000',
  last_undelegated_at: null,
  locked_tokens: '0',
  locked_until: 0,
  query_fee_cut: '950000',
  realized_rewards: '0',
  share_amount: '12696807359844264068382',
  staked_tokens: '26280492000000000000000',
  unstaked_tokens: '0',
  url: 'https://graph-l2prod.ellipfra.com/',
};

const DELEGATOR = {
  id: '0xa244c90fa973b485d6a63c8af33fc9bc06c40d7e',
  active_stakes_count: 1,
  stakes_count: 1,
  total_realized_rewards: '0',
  total_staked_tokens: '26280492000000000000000',
  total_unstaked_tokens: '0',
};

const SIGNAL = {
  deployment_query_fees_amount: '270785555949007712211',
  deployment_signalled_tokens: '9906631748402242039886',
  deployment_staked_tokens: '15000000000000000000000',
  id: '0xacbd…-0x63ce…',
  last_signal_change: 1743704030,
  realized_rewards: '0',
  signal: '9900000000000000000000',
  signalled_tokens: '9900000000000000000000',
  subgraph_deployment: '0x63ce37b3ab8782d7b656919b9a8766e99bed482af96d5524c4a0a886e629f271',
  unsignalled_tokens: '0',
};

const CURATOR = {
  id: '0xacbdc195a79ea9766204ad7e082f1b36a32c0db5',
  active_signal_count: 19,
  signal_count: 19,
  realized_rewards: '0',
  total_signalled_tokens: '9900000000000000000000',
  total_unsignalled_tokens: '0',
};

describe('a delegator portfolio with something in it', () => {
  it('hoists the stakes back onto the delegator the page reads', () => {
    const { delegator } = normaliseDelegatorPortfolio({ delegator: DELEGATOR, stakes: [STAKE] });
    // `for (const stake of delegator.stakes)` is the line that threw in production.
    expect(delegator?.stakes).toHaveLength(1);
    expect([...(delegator?.stakes ?? [])]).toHaveLength(1);
  });

  it('carries the wei figures across under the names the page uses', () => {
    const { delegator } = normaliseDelegatorPortfolio({ delegator: DELEGATOR, stakes: [STAKE] });
    expect(delegator?.totalStakedTokens).toBe('26280492000000000000000');
    expect(delegator?.stakes[0].stakedTokens).toBe('26280492000000000000000');
    expect(delegator?.stakes[0].shareAmount).toBe('12696807359844264068382');
  });

  /**
   * The reward cut arrives as the string "430000" and the page divides it. Left as a string it
   * renders NaN, which is the same failure the Sync Warning badge had - a number that is not a
   * number reaching the screen because nothing turned it into one.
   */
  it('turns the ppm cuts into numbers', () => {
    const { indexer } = normaliseStake(STAKE);
    expect(indexer.indexingRewardCut).toBe(430000);
    expect(indexer.queryFeeCut).toBe(950000);
    expect(Number.isNaN(indexer.indexingRewardCut)).toBe(false);
  });

  it('gathers the flattened indexer fields back into an indexer', () => {
    const { indexer } = normaliseStake(STAKE);
    expect(indexer.id).toBe('0xf92f430dd8567b0d466358c79594ab58d919a6d4');
    expect(indexer.delegatedTokens).toBe('166737621941497215885063976');
    expect(indexer.delegatorShares).toBe('69389273052978902981955919');
    // The page renders the address when there is no name, which is what this route carries.
    expect(indexer.account.id).toBe(indexer.id);
  });

  /** Never undelegated is null, not zero: the page renders a date from it. */
  it('keeps a null last-undelegated as null', () => {
    expect(normaliseStake(STAKE).lastUndelegatedAt).toBeNull();
    expect(normaliseStake({ ...STAKE, last_undelegated_at: 1743704030 }).lastUndelegatedAt).toBe(
      1743704030,
    );
  });

  it('answers a null delegator for an address that has never delegated', () => {
    expect(normaliseDelegatorPortfolio({ delegator: null, stakes: [] })).toEqual({
      delegator: null,
    });
  });

  /** A summary count that disagrees with the rows would put a header above a table it contradicts. */
  it('falls back to counting the rows when the summary omits the count', () => {
    const { delegator } = normaliseDelegatorPortfolio({
      delegator: { id: '0xa' },
      stakes: [STAKE, { ...STAKE, active: false }],
    });
    expect(delegator?.stakesCount).toBe(2);
    expect(delegator?.activeStakesCount).toBe(1);
  });

  it('survives stakes being absent entirely rather than throwing on it', () => {
    const { delegator } = normaliseDelegatorPortfolio({ delegator: DELEGATOR });
    expect(delegator?.stakes).toEqual([]);
  });
});

describe('a curator portfolio with something in it', () => {
  it('hoists the signals back onto the curator', () => {
    const { curator } = normaliseCuratorPortfolio({ curator: CURATOR, signals: [SIGNAL] });
    // `curator.signals.map(...)` is the line that threw in production.
    expect(curator?.signals.map((s) => s.signal)).toEqual(['9900000000000000000000']);
  });

  it('nests the deployment figures the way the page reads them', () => {
    const { subgraphDeployment } = normaliseSignal(SIGNAL);
    expect(subgraphDeployment.signalledTokens).toBe('9906631748402242039886');
    expect(subgraphDeployment.queryFeesAmount).toBe('270785555949007712211');
    expect(subgraphDeployment.stakedTokens).toBe('15000000000000000000000');
  });

  /**
   * This route sends the bytes32 id and no IPFS hash, and the page links on `ipfsHash`. The id is
   * what it has; inventing a hash would be a link to nothing.
   */
  it('uses the deployment id where no ipfs hash is sent', () => {
    expect(normaliseSignal(SIGNAL).subgraphDeployment.ipfsHash).toBe(SIGNAL.subgraph_deployment);
  });

  it('zeroes the figures this route does not carry, because the page does arithmetic on them', () => {
    const { curator } = normaliseCuratorPortfolio({ curator: CURATOR, signals: [] });
    expect(curator?.totalNameSignalledTokens).toBe('0');
    expect(curator?.totalWithdrawnTokens).toBe('0');
  });

  it('answers a null curator for an address that has never signalled', () => {
    expect(normaliseCuratorPortfolio({ curator: null, signals: [] })).toEqual({ curator: null });
  });
});
