import { describe, it, expect } from 'vitest';
import {
  epochStatus,
  annualIssuancePercent,
  cooldownRemainingDays,
  L1_BLOCKS_PER_YEAR,
  REWARDS_MANAGER,
  indexingIssuancePerBlock,
  annualIndexingIssuance,
} from '../network-math';

describe('epochStatus', () => {
  it('labels the current epoch Active (and anything ahead, defensively)', () => {
    expect(epochStatus(1274, 1274)).toBe('Active');
    expect(epochStatus(1275, 1274)).toBe('Active');
  });
  it('labels the progression of recently-closed epochs', () => {
    expect(epochStatus(1273, 1274)).toBe('Settling');
    expect(epochStatus(1272, 1274)).toBe('Distributing');
  });
  it('labels older epochs Finalized', () => {
    expect(epochStatus(1271, 1274)).toBe('Finalized');
    expect(epochStatus(1, 1274)).toBe('Finalized');
  });
});

describe('annualIssuancePercent', () => {
  it('annualises issuance-per-block over supply', () => {
    // 120.73 GRT/block over ~2.6M blocks/yr ÷ 3.647B supply ≈ 8.6%
    const pct = annualIssuancePercent(120.73, 3_647_392_487);
    expect(pct).toBeGreaterThan(8);
    expect(pct).toBeLessThan(9);
  });
  it('scales linearly with the per-block rate', () => {
    const a = annualIssuancePercent(100, 1_000_000_000);
    const b = annualIssuancePercent(200, 1_000_000_000);
    expect(b).toBeCloseTo(a * 2, 9);
  });
  it('returns 0 for non-positive supply or negative issuance', () => {
    expect(annualIssuancePercent(100, 0)).toBe(0);
    expect(annualIssuancePercent(-1, 1_000)).toBe(0);
  });
  it('honours a custom blocks-per-year', () => {
    expect(annualIssuancePercent(1, 100, 100)).toBeCloseTo(100, 9); // 1*100/100 = 1.0 → 100%
  });
  it('uses a sane L1 blocks/year constant (~2.6M)', () => {
    expect(L1_BLOCKS_PER_YEAR).toBeGreaterThan(2_500_000);
    expect(L1_BLOCKS_PER_YEAR).toBeLessThan(2_700_000);
  });
});

describe('indexingIssuancePerBlock', () => {
  const innovation = '0x2ff06ba8086f37ba656a5b75405bf985f738b16e';

  it('prefers indexingRate over the allocations rows', () => {
    expect(indexingIssuancePerBlock({
      indexingRate: 96.584,
      allocations: [
        { target: REWARDS_MANAGER, rate: 1 },
        { target: innovation, rate: 24.146 },
      ],
    })).toBeCloseTo(96.584);
  });

  it('falls back to the RewardsManager row when indexingRate is absent', () => {
    expect(indexingIssuancePerBlock({
      allocations: [
        { target: REWARDS_MANAGER.toUpperCase(), rate: 96.584 },
        { target: innovation, rate: 24.146 },
      ],
    })).toBeCloseTo(96.584);
  });

  it('returns 0 when dips has not loaded or the RewardsManager is missing', () => {
    expect(indexingIssuancePerBlock(undefined)).toBe(0);
    expect(indexingIssuancePerBlock({ allocations: [{ target: innovation, rate: 24.146 }] })).toBe(0);
    expect(annualIndexingIssuance(0)).toBe(0);
  });
});

describe('annualIndexingIssuance', () => {
  it('annualises the RewardsManager rate, not protocol-total issuance', () => {
    const next = annualIndexingIssuance(96.584);
    expect(next).toBeCloseTo(96.584 * L1_BLOCKS_PER_YEAR);
    // The pre-fix figure was 120.73 × 2,628,000. The new one is 96.584 × 2,610,223.
    const old = 120.73 * 2_628_000;
    expect(old / next).toBeCloseTo((120.73 / 96.584) * (2_628_000 / L1_BLOCKS_PER_YEAR), 8);
  });
});

describe('cooldownRemainingDays', () => {
  const NOW = 1_800_000_000;
  it('returns 0 when no cooldown is configured', () => {
    expect(cooldownRemainingDays(0, NOW - 1000, NOW)).toBe(0);
  });
  it('returns 0 when the cooldown has already elapsed', () => {
    // 7-day cooldown, last update 10 days ago → elapsed
    expect(cooldownRemainingDays(7 * 86400, NOW - 10 * 86400, NOW)).toBe(0);
  });
  it('returns the days remaining mid-cooldown', () => {
    // 7-day cooldown, last update 2 days ago → 5 days remaining
    expect(cooldownRemainingDays(7 * 86400, NOW - 2 * 86400, NOW)).toBeCloseTo(5, 6);
  });
  it('returns the full period for a just-changed parameter', () => {
    expect(cooldownRemainingDays(28 * 86400, NOW, NOW)).toBeCloseTo(28, 6);
  });
});
