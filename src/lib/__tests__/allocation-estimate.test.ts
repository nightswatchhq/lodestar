import { describe, expect, it } from 'vitest';
import { estimatedAllocationApr } from '../allocation-estimate';

describe('marginal allocation APR', () => {
  it('dilutes when deployment stake rises, including the proposed allocation', () => {
    expect(estimatedAllocationApr(100_000_000, 10, 100, 100_000, 100_000)).toBeCloseTo(5_000);
    expect(estimatedAllocationApr(100_000_000, 10, 100, 300_000, 100_000)).toBeCloseTo(2_500);
  });

  it('does not present an estimate with missing issuance or network signal', () => {
    expect(estimatedAllocationApr(0, 10, 100, 100_000)).toBeNull();
    expect(estimatedAllocationApr(100, 10, 0, 100_000)).toBeNull();
  });
});
