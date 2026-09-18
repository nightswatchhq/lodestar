import { describe, it, expect } from 'vitest';
import type { Provision } from '@/lib/queries';
import {
  SUBGRAPH_SERVICE_ID,
  subgraphServiceStake,
  plainGRT,
} from '../subgraph-service-stake';

const DISPATCH = '0x7101d5c1a5c89c3647f5118da118e56c023ba0b9';

function provision(
  service: string,
  tokens: { provisioned: string; allocated: string; thawing: string },
): Provision {
  return {
    id: `${service}-p`,
    tokensProvisioned: tokens.provisioned,
    tokensAllocated: tokens.allocated,
    tokensThawing: tokens.thawing,
    maxVerifierCut: '0',
    thawingPeriod: '0',
    createdAt: '0',
    allocationCount: 1,
    dataService: {
      id: service,
      totalTokensProvisioned: '0',
      totalTokensAllocated: '0',
      minimumThawingPeriod: '0',
      maximumThawingPeriod: '0',
    },
  };
}

describe('subgraphServiceStake', () => {
  it('is provisioned plus delegated minus allocated minus thawing', () => {
    const stake = subgraphServiceStake(
      [
        provision(SUBGRAPH_SERVICE_ID, {
          provisioned: '1000000000000000000000000',
          allocated: '400000000000000000000000',
          thawing: '100000000000000000000000',
        }),
      ],
      0,
    );
    expect(stake?.provisioned).toBe(1_000_000);
    expect(stake?.allocated).toBeCloseTo(400_000, 5);
    expect(stake?.thawing).toBeCloseTo(100_000, 5);
    expect(stake?.available).toBe(500_000);
    expect(stake?.allocationRatio).toBeCloseTo(0.4);
  });

  it('adds active delegation, because allocated already includes it', () => {
    const stake = subgraphServiceStake(
      [
        provision(SUBGRAPH_SERVICE_ID, {
          provisioned: '2000000000000000000000000',
          allocated: '16000000000000000000000000',
          thawing: '0',
        }),
      ],
      14_000_000,
    );
    expect(stake?.available).toBeCloseTo(0, 5);
    expect(stake?.allocationRatio).toBeCloseTo(16_000_000 / 16_000_000);
  });

  it('does not treat a fully allocated provision with leftover delegation as empty', () => {
    const stake = subgraphServiceStake(
      [
        provision(SUBGRAPH_SERVICE_ID, {
          provisioned: '1300000000000000000000000',
          allocated: '16000000000000000000000000',
          thawing: '0',
        }),
      ],
      14_850_000,
    );
    expect(stake?.available).toBeCloseTo(150_000, 0);
    expect(stake?.allocationRatio).toBeCloseTo(16_000_000 / (1_300_000 + 14_850_000));
  });

  it('ignores other data services', () => {
    const stake = subgraphServiceStake(
      [
        provision(DISPATCH, {
          provisioned: '9000000000000000000000000',
          allocated: '0',
          thawing: '0',
        }),
        provision(SUBGRAPH_SERVICE_ID, {
          provisioned: '1000000000000000000000000',
          allocated: '250000000000000000000000',
          thawing: '0',
        }),
      ],
      0,
    );
    expect(stake?.available).toBe(750_000);
    expect(stake?.provisioned).toBe(1_000_000);
  });

  it('matches the service id case-insensitively', () => {
    const stake = subgraphServiceStake(
      [
        provision('0xB2BB92D0DE618878E438B55D5846CFECD9301105', {
          provisioned: '1000000000000000000000',
          allocated: '0',
          thawing: '0',
        }),
      ],
      0,
    );
    expect(stake?.available).toBe(1000);
  });

  it('floors available at zero rather than going negative', () => {
    const stake = subgraphServiceStake(
      [
        provision(SUBGRAPH_SERVICE_ID, {
          provisioned: '1000000000000000000000000',
          allocated: '800000000000000000000000',
          thawing: '400000000000000000000000',
        }),
      ],
      0,
    );
    expect(stake?.available).toBe(0);
  });

  it('returns null when there is no SubgraphService provision, not a zero available', () => {
    expect(subgraphServiceStake([], 0)).toBeNull();
    expect(
      subgraphServiceStake(
        [
          provision(DISPATCH, {
            provisioned: '1000000000000000000000000',
            allocated: '0',
            thawing: '0',
          }),
        ],
        5_000_000,
      ),
    ).toBeNull();
  });

  it('has no allocation ratio when the pool is empty', () => {
    const stake = subgraphServiceStake(
      [
        provision(SUBGRAPH_SERVICE_ID, {
          provisioned: '0',
          allocated: '0',
          thawing: '0',
        }),
      ],
      0,
    );
    expect(stake?.allocationRatio).toBeNull();
    expect(stake?.available).toBe(0);
  });
});

describe('plainGRT', () => {
  it('writes an ungrouped number, not an abbreviation or thousands separators', () => {
    expect(plainGRT(1_500_000)).toBe('1500000');
    expect(plainGRT(500_000.5)).toBe('500000.5');
    expect(plainGRT(12.34)).toBe('12.34');
    expect(plainGRT(0)).toBe('0');
  });

  it('returns empty for non-finite values rather than "NaN"', () => {
    expect(plainGRT(Number.NaN)).toBe('');
    expect(plainGRT(Number.POSITIVE_INFINITY)).toBe('');
  });
});
