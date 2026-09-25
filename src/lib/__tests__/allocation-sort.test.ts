import { describe, it, expect } from 'vitest';
import { nextSort, sortAllocations, type SortableAllocation } from '../allocation-sort';

const row = (deploymentId: string, over: Partial<SortableAllocation> = {}): SortableAllocation => ({
  deploymentId,
  ipfsHash: `Qm${deploymentId}`,
  displayName: null,
  status: 'synced',
  blocksBehind: 0,
  allocatedTokens: '0',
  signalledTokens: '0',
  ...over,
});

const ids = (rows: SortableAllocation[]) => rows.map((r) => r.deploymentId);
const noSuccess = () => null;

describe('nextSort', () => {
  it('starts amounts largest first and names from A', () => {
    expect(nextSort(null, 'allocated')).toEqual({ key: 'allocated', dir: 'desc' });
    expect(nextSort(null, 'deployment')).toEqual({ key: 'deployment', dir: 'asc' });
  });

  it('flips the same column and resets for a new one', () => {
    expect(nextSort({ key: 'allocated', dir: 'desc' }, 'allocated')).toEqual({ key: 'allocated', dir: 'asc' });
    expect(nextSort({ key: 'allocated', dir: 'asc' }, 'signalled')).toEqual({ key: 'signalled', dir: 'desc' });
  });
});

describe('sortAllocations', () => {
  it('leaves the order alone with no sort, and does not mutate its input', () => {
    const rows = [row('b'), row('a')];
    expect(ids(sortAllocations(rows, null, noSuccess))).toEqual(['b', 'a']);
    sortAllocations(rows, { key: 'deployment', dir: 'asc' }, noSuccess);
    expect(ids(rows)).toEqual(['b', 'a']);
  });

  it('compares token amounts as exact wei, not as floats', () => {
    const rows = [
      row('small', { allocatedTokens: '9007199254740993000000' }),
      row('large', { allocatedTokens: '9007199254740993000001' }),
      row('tiny', { allocatedTokens: '1' }),
    ];
    expect(ids(sortAllocations(rows, { key: 'allocated', dir: 'desc' }, noSuccess))).toEqual(['large', 'small', 'tiny']);
    expect(ids(sortAllocations(rows, { key: 'allocated', dir: 'asc' }, noSuccess))).toEqual(['tiny', 'small', 'large']);
  });

  it('keeps missing figures last in both directions', () => {
    const rows = [row('none', { blocksBehind: null }), row('far', { blocksBehind: 900 }), row('near', { blocksBehind: 3 })];
    expect(ids(sortAllocations(rows, { key: 'blocksBehind', dir: 'desc' }, noSuccess))).toEqual(['far', 'near', 'none']);
    expect(ids(sortAllocations(rows, { key: 'blocksBehind', dir: 'asc' }, noSuccess))).toEqual(['near', 'far', 'none']);
  });

  it('reads query success through the lookup, and a row with no traffic sorts last', () => {
    const rates: Record<string, number> = { Qmhigh: 0.99, Qmlow: 0.4 };
    const rows = [row('quiet'), row('low'), row('high')];
    const sorted = sortAllocations(rows, { key: 'querySuccess', dir: 'desc' }, (hash) => rates[hash]);
    expect(ids(sorted)).toEqual(['high', 'low', 'quiet']);
  });

  it('orders status healthiest first, and names case-insensitively', () => {
    const byStatus = [row('f', { status: 'failed' }), row('u', { status: 'unreachable' }), row('s', { status: 'synced' }), row('y', { status: 'syncing' })];
    expect(ids(sortAllocations(byStatus, { key: 'status', dir: 'asc' }, noSuccess))).toEqual(['s', 'y', 'f', 'u']);
    const byName = [row('x', { displayName: 'beta' }), row('y', { displayName: 'Alpha' })];
    expect(ids(sortAllocations(byName, { key: 'deployment', dir: 'asc' }, noSuccess))).toEqual(['y', 'x']);
  });

  it('sorts an unnamed row by the deployment ID its cell shows, not by its IPFS hash', () => {
    const rows = [
      row('0xb911', { ipfsHash: 'QmAAA' }),
      row('0xb2e0', { ipfsHash: 'QmZZZ' }),
      row('0xb8e4', { ipfsHash: 'QmMMM' }),
    ];
    expect(ids(sortAllocations(rows, { key: 'deployment', dir: 'asc' }, noSuccess))).toEqual(['0xb2e0', '0xb8e4', '0xb911']);
  });

  it('puts the most accrued first, and an unread or closed row last', () => {
    const rows = [
      row('unread', { pendingRewards: null }),
      row('small', { pendingRewards: '9007199254740993000000' }),
      row('closed', { pendingRewards: '1', lifecycle: 'closed' }),
      row('large', { pendingRewards: '9007199254740994000000' }),
    ];
    expect(ids(sortAllocations(rows, { key: 'accrued', dir: 'desc' }, noSuccess)))
      .toEqual(['large', 'small', 'closed', 'unread']);
  });

  it('breaks ties by deployment so a page never reshuffles', () => {
    const rows = [row('c', { signalledTokens: '5' }), row('a', { signalledTokens: '5' }), row('b', { signalledTokens: '5' })];
    expect(ids(sortAllocations(rows, { key: 'signalled', dir: 'desc' }, noSuccess))).toEqual(['a', 'b', 'c']);
  });
});
