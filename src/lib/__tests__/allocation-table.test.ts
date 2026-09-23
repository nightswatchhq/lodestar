import { describe, it, expect } from 'vitest';
import {
  parseAllocTableState,
  applyAllocTableState,
  unifyClosed,
  filterAllocations,
  needsAttention,
  ageEpochs,
  createdAtSec,
  allocationsCsv,
  type UnifiedAllocation,
} from '../allocation-table';
import type { ClosedAllocation } from '@/lib/contracts/indexer-detail';

const NOW = 1_700_000_000;
const EPOCH = 1000;
const EPOCH_LEN = 6646;

function active(over: Partial<UnifiedAllocation> = {}): UnifiedAllocation {
  return {
    allocationId: '0xa',
    deploymentId: '0xd',
    ipfsHash: 'QmX',
    displayName: 'sg',
    allocatedTokens: '1',
    signalledTokens: '1',
    stakedTokens: '1',
    createdAtEpoch: 990,
    status: 'synced',
    lifecycle: 'active',
    closedAtEpoch: null,
    closedAt: null,
    indexingRewards: null,
    queryFeesCollected: null,
    poi: null,
    forceClosed: false,
    lastPoiAt: null,
    ...over,
  };
}

function closed(over: Partial<ClosedAllocation> = {}): ClosedAllocation {
  return {
    id: '0xc',
    allocatedTokens: '1',
    createdAtEpoch: 900,
    closedAtEpoch: 920,
    closedAt: NOW - 10 * 86400,
    indexingRewards: '2',
    queryFeesCollected: '0',
    poi: '0xpoi',
    forceClosed: false,
    subgraphDeployment: { id: '0xd', ipfsHash: 'QmY', displayName: 'old' },
    ...over,
  };
}

describe('parseAllocTableState', () => {
  it('defaults to active, no sort, first page', () => {
    expect(parseAllocTableState(new URLSearchParams())).toEqual({
      view: 'active',
      sort: null,
      page: 0,
      network: null,
      from: null,
      to: null,
      attention: false,
    });
  });

  it('reads view, sort, network, dates and the attention preset', () => {
    const p = new URLSearchParams('view=closed&sort=age&dir=asc&network=arbitrum-one&from=2026-09-01&to=2026-09-18&attention=1&page=2');
    expect(parseAllocTableState(p)).toEqual({
      view: 'closed',
      sort: { key: 'age', dir: 'asc' },
      page: 2,
      network: 'arbitrum-one',
      from: '2026-09-01',
      to: '2026-09-18',
      attention: true,
    });
  });

  it('ignores an unknown view and a malformed date rather than inventing a filter', () => {
    const p = new URLSearchParams('view=nope&from=yesterday&to=2026-13-99');
    const s = parseAllocTableState(p);
    expect(s.view).toBe('active');
    expect(s.from).toBeNull();
    expect(s.to).toBeNull();
  });
});

describe('applyAllocTableState', () => {
  it('omits defaults so a shared URL stays short', () => {
    const p = new URLSearchParams('tab=allocations');
    applyAllocTableState(p, {
      view: 'active',
      sort: null,
      page: 0,
      network: null,
      from: null,
      to: null,
      attention: false,
    });
    expect(p.toString()).toBe('tab=allocations');
  });

  it('writes only the keys that are not the default', () => {
    const p = new URLSearchParams('tab=allocations');
    applyAllocTableState(p, {
      view: 'all',
      sort: { key: 'allocated', dir: 'desc' },
      page: 1,
      network: 'base',
      from: '2026-01-01',
      to: null,
      attention: true,
    });
    expect(p.get('view')).toBe('all');
    expect(p.get('sort')).toBe('allocated');
    expect(p.get('dir')).toBeNull();
    expect(p.get('page')).toBe('1');
    expect(p.get('network')).toBe('base');
    expect(p.get('from')).toBe('2026-01-01');
    expect(p.get('attention')).toBe('1');
    expect(p.get('tab')).toBe('allocations');
  });
});

describe('filterAllocations', () => {
  const rows = [
    active({ allocationId: 'ok', status: 'synced', network: 'arbitrum-one', createdAtEpoch: EPOCH - 2 }),
    active({ allocationId: 'lag', status: 'synced', network: 'base', blocksBehind: 80, createdAtEpoch: EPOCH - 40 }),
    active({ allocationId: 'fail', status: 'failed', network: 'arbitrum-one', createdAtEpoch: EPOCH - 3 }),
    ...unifyClosed([closed({ id: 'old' })]),
  ];

  it('keeps only the requested lifecycle', () => {
    const activeOnly = filterAllocations(rows, parseAllocTableState(new URLSearchParams()), NOW, EPOCH, EPOCH_LEN);
    expect(activeOnly.map((r) => r.allocationId)).toEqual(['ok', 'lag', 'fail']);
    const closedOnly = filterAllocations(rows, parseAllocTableState(new URLSearchParams('view=closed')), NOW, EPOCH, EPOCH_LEN);
    expect(closedOnly.map((r) => r.allocationId)).toEqual(['old']);
    expect(filterAllocations(rows, parseAllocTableState(new URLSearchParams('view=all')), NOW, EPOCH, EPOCH_LEN)).toHaveLength(4);
  });

  it('filters by network', () => {
    const got = filterAllocations(
      rows,
      parseAllocTableState(new URLSearchParams('network=base')),
      NOW, EPOCH, EPOCH_LEN,
    );
    expect(got.map((r) => r.allocationId)).toEqual(['lag']);
  });

  it('needs attention is failed, syncing, or lag past the synced tolerance', () => {
    expect(needsAttention(active({ status: 'failed' }))).toBe(true);
    expect(needsAttention(active({ status: 'syncing' }))).toBe(true);
    expect(needsAttention(active({ status: 'synced', blocksBehind: 51 }))).toBe(true);
    expect(needsAttention(active({ status: 'synced', blocksBehind: 50 }))).toBe(false);
    expect(needsAttention(unifyClosed([closed()])[0])).toBe(false);
    const got = filterAllocations(
      rows,
      parseAllocTableState(new URLSearchParams('attention=1')),
      NOW, EPOCH, EPOCH_LEN,
    );
    expect(got.map((r) => r.allocationId).sort()).toEqual(['fail', 'lag']);
  });

  it('keeps rows allocated or closed inside the date range', () => {
    const from = new Date((NOW - 12 * 86400) * 1000).toISOString().slice(0, 10);
    const to = new Date((NOW - 8 * 86400) * 1000).toISOString().slice(0, 10);
    const got = filterAllocations(
      rows,
      parseAllocTableState(new URLSearchParams(`view=all&from=${from}&to=${to}`)),
      NOW, EPOCH, EPOCH_LEN,
    );
    expect(got.map((r) => r.allocationId)).toEqual(['old']);
  });
});

describe('ageEpochs', () => {
  it('is current minus created for an open allocation, closed minus created once closed', () => {
    expect(ageEpochs(980, 1000, null)).toBe(20);
    expect(ageEpochs(980, 1000, 990)).toBe(10);
  });
});

describe('createdAtSec', () => {
  it('walks back from now by epoch length', () => {
    const t = createdAtSec(EPOCH - 1, EPOCH, EPOCH_LEN, NOW);
    const oneEpoch = EPOCH_LEN * 12.09;
    expect(NOW - t).toBeCloseTo(oneEpoch, 3);
  });
});

describe('allocationsCsv', () => {
  const ctx = { currentEpoch: EPOCH, epochLengthBlocks: EPOCH_LEN, nowSec: NOW, foghornSuccess: () => 0.98 };
  const ALLOC = '0x3f1c8a2b9d4e5f60718293a4b5c6d7e8f9012345';

  it('writes every row it is given with the IDs whole and amounts exact', () => {
    const rows = [
      active({ allocationId: ALLOC, allocatedTokens: '1234567890123456789012', displayName: 'Uniswap, v3', network: 'mainnet' }),
      ...unifyClosed([closed({ indexingRewards: '5000000000000000000', forceClosed: true })]),
    ];
    const [header, a, c, ...rest] = allocationsCsv(rows, ctx).split('\n');
    expect(rest).toEqual([]);
    const col = (line: string, name: string) => line.split(',')[header.split(',').indexOf(name)];
    expect(a.startsWith(`${ALLOC},QmX,0xd,"Uniswap, v3",mainnet,active,synced,`)).toBe(true);
    expect(a).toContain(',1234.567890123456789012,');
    expect(col(c, 'lifecycle')).toBe('closed');
    expect(col(c, 'status')).toBe('');
    expect(col(c, 'indexing_rewards_grt')).toBe('5');
    expect(col(c, 'poi')).toBe('0xpoi');
    expect(col(c, 'force_closed')).toBe('true');
    expect(col(c, 'closed_at')).toBe(new Date((NOW - 10 * 86400) * 1000).toISOString());
  });

  it('exports accrued rewards on open allocations, blank rather than zero where none was read', () => {
    const rows = [active({ pendingRewards: '2500000000000000000' }), active({ pendingRewards: null })];
    const [header, read, unread] = allocationsCsv(rows, ctx).split('\n');
    const col = (line: string, name: string) => line.split(',')[header.split(',').indexOf(name)];
    expect(col(read, 'accrued_grt')).toBe('2.5');
    expect(col(unread, 'accrued_grt')).toBe('');
  });
});
