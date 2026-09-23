import { describe, it, expect } from 'vitest';
import type { ActiveAllocation } from '../contracts/indexer-detail';
import { accruedTotal, accruedWei } from '../pending-rewards';

const alloc = (id: string, pendingRewards?: string | null): ActiveAllocation => ({
  id,
  allocatedTokens: '0',
  createdAtEpoch: 0,
  subgraphDeployment: { id: 'd', ipfsHash: 'Qm', signalledTokens: '0', stakedTokens: '0', displayName: null },
  ...(pendingRewards === undefined ? {} : { pendingRewards }),
});

describe('accruedTotal', () => {
  it('is unavailable, not zero, when kittiwake sent no reading', () => {
    expect(accruedTotal(undefined)).toEqual({ kind: 'unavailable' });
    expect(accruedTotal([alloc('a'), alloc('b')])).toEqual({ kind: 'unavailable' });
  });

  it('sums exact wei and counts the rows the chain read failed on', () => {
    const total = accruedTotal([
      alloc('a', '3802500000000000000000'),
      alloc('b', '9007199254740993'),
      alloc('c', null),
    ]);
    expect(total).toEqual({ kind: 'ready', wei: 3802509007199254740993n, unread: 1 });
  });

  it('is unavailable when no row could be read', () => {
    expect(accruedTotal([alloc('a', null), alloc('b', null)])).toEqual({ kind: 'unavailable' });
  });

  it('is a true zero for an indexer with nothing open', () => {
    expect(accruedTotal([])).toEqual({ kind: 'ready', wei: 0n, unread: 0 });
  });
});

describe('accruedWei', () => {
  it('reads wei and treats anything unreadable as not read', () => {
    expect(accruedWei('0')).toBe(0n);
    expect(accruedWei(null)).toBeNull();
    expect(accruedWei(undefined)).toBeNull();
    expect(accruedWei('nope')).toBeNull();
  });
});
