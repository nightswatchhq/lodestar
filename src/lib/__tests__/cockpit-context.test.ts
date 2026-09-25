import { describe, expect, it } from 'vitest';
import { actionContext } from '../cockpit-context';
import type { SubgraphDeployment } from '../api';
import type { ActiveAllocation } from '../contracts/indexer-detail';

const WEI = 10n ** 18n;
const grt = (n: number) => (BigInt(n) * WEI).toString();

const deployment = (signal: number, stake: number, deniedSince: number | null = null) =>
  ({ id: '0x1', ipfsHash: 'QmA', signalledTokens: grt(signal), stakedTokens: grt(stake), displayName: 'Uniswap', deniedSince }) as unknown as SubgraphDeployment;

const alloc = (id: string, amount: number, pending: number | null): ActiveAllocation =>
  ({ id, allocatedTokens: grt(amount), createdAtEpoch: 1, pendingRewards: pending == null ? null : grt(pending),
    subgraphDeployment: { id: '0x1', ipfsHash: 'QmA', signalledTokens: '0', stakedTokens: '0', displayName: null } }) as ActiveAllocation;

const base = { annualIssuance: 100_000_000, totalSignalGrt: 1_000_000, allocations: [alloc('0xAA', 100_000, 250)], poiDetail: undefined, indexer: '0xme' };

describe('actionContext', () => {
  it('estimates an allocate against the stake already there', () => {
    const c = actionContext({ ...base, action: { type: 'allocate', allocationID: null, amount: '100000' }, deployment: deployment(10_000, 100_000) });
    // 1e8 × 0.01 × 100k ÷ 200k = 500k a year on 100k: 500%.
    expect(c.estimatedApr).toBeCloseTo(500);
    expect(c.accruedGrt).toBeNull();
    expect(c.poi).toBeNull();
  });

  it('takes a reallocate\'s own old stake out of the competition, and reports what the close collects', () => {
    const c = actionContext({ ...base, action: { type: 'reallocate', allocationID: '0xaa', amount: '100000' }, deployment: deployment(10_000, 100_000) });
    expect(c.estimatedApr).toBeCloseTo(1_000);
    expect(c.accruedGrt).toBeCloseTo(250);
  });

  it('says a denied deployment earns nothing', () => {
    const c = actionContext({ ...base, action: { type: 'allocate', allocationID: null, amount: '100000' }, deployment: deployment(10_000, 0, 42) });
    expect(c.denied).toBe(true);
    expect(c.estimatedApr).toBe(0);
  });

  it('checks the POI only for closes, and only once the record has been read', () => {
    const close = { type: 'unallocate', allocationID: '0xaa', amount: null };
    expect(actionContext({ ...base, action: close, deployment: null }).poi).toBeNull();
    expect(actionContext({ ...base, action: close, deployment: null, poiDetail: null }).poi).toEqual({ kind: 'no-data' });
    expect(actionContext({ ...base, action: { type: 'allocate', allocationID: null, amount: '1' }, deployment: null, poiDetail: null }).poi).toBeNull();
  });

  it('knows nothing about a deployment it could not read', () => {
    const c = actionContext({ ...base, action: { type: 'allocate', allocationID: null, amount: '100000' }, deployment: null });
    expect(c).toMatchObject({ name: null, signalGrt: null, estimatedApr: null, denied: false });
  });
});
