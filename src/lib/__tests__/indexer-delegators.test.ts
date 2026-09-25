import { describe, it, expect } from 'vitest';
import {
  DETAIL_DELEGATOR_CAP,
  delegatorsTabLabel,
  fromDetail,
  fromServedPage,
  nextDelegatorSort,
  shareOfPool,
  sharesToTokens,
  DELEGATOR_EXPORT_CAP,
  collectDelegators,
  delegatorsCsv,
} from '../indexer-delegators';
import type { IndexerDelegatorsPage } from '../contracts/indexer-delegators';

const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

function detailRow(n: number, shareAmount: string) {
  return { id: `${addr(n)}-0xindexer`, stakedTokens: '1', shareAmount, delegator: { id: addr(n) } };
}

// The pool 0x2f09…f1ce had on 2026-09-23, near enough: wei and shares at real magnitudes.
const POOL = { delegatorShares: '71439299428911516114298997', delegatedTokens: '165509546746463656406107704' };

describe('nextDelegatorSort', () => {
  it('flips the same column and starts a new one largest first', () => {
    expect(nextDelegatorSort({ key: 'stake', dir: 'desc' }, 'stake')).toEqual({ key: 'stake', dir: 'asc' });
    expect(nextDelegatorSort({ key: 'stake', dir: 'asc' }, 'lastChangeAt')).toEqual({ key: 'lastChangeAt', dir: 'desc' });
  });
});

describe('pool arithmetic', () => {
  it('values shares in exact wei, as the contract does', () => {
    // 5017656192609777038808807 shares of that pool; a float would be wrong by thousands of wei.
    expect(sharesToTokens('5017656192609777038808807', POOL.delegatorShares, POOL.delegatedTokens)).toBe(
      ((BigInt('5017656192609777038808807') * BigInt(POOL.delegatedTokens)) / BigInt(POOL.delegatorShares)).toString(),
    );
  });

  it('gives a share of the pool that sums to one', () => {
    expect(shareOfPool(POOL.delegatorShares, POOL.delegatorShares)).toBe(1);
    expect(shareOfPool('1', '4')).toBe(0.25);
  });

  it('says it does not know rather than dividing by an empty pool', () => {
    expect(shareOfPool('1', '0')).toBeNull();
    expect(sharesToTokens('1', '0', '10')).toBeNull();
    expect(shareOfPool('1', undefined)).toBeNull();
  });
});

describe('fromServedPage', () => {
  const page: IndexerDelegatorsPage = {
    delegators: [
      {
        id: 'x',
        delegator: { id: addr(1) },
        shareAmount: '5017656192609777038808807',
        currentTokens: '11624834073223557856362496',
        totalDelegatedTokens: '10300000000000000000000000',
        thawingTokens: '0',
        thawingUntil: null,
        lockedTokens: '0',
        delegatedAt: 1788253100,
        lastChangeAt: 1788253100,
      },
    ],
    total: 2534,
    active: 2498,
    pool: POOL,
  };

  it('keeps the figures kittiwake computed and is neither partial nor a fallback', () => {
    const view = fromServedPage(page);
    expect(view.partial).toBe(false);
    expect(view.fallback).toBe(false);
    expect(view.total).toBe(2534);
    expect(view.active).toBe(2498);
    expect(view.rows[0].currentTokens).toBe('11624834073223557856362496');
    expect(view.rows[0].shareOfPool).toBeCloseTo(0.07024, 4);
  });

  it('carries a missing total through as null, not zero', () => {
    expect(fromServedPage({ ...page, delegators: [], total: null, active: null, pool: null }).total).toBeNull();
  });
});

describe('fromDetail', () => {
  const detail = (rows: ReturnType<typeof detailRow>[]) => ({ delegators: rows, ...POOL });

  it('says a full hundred is not every delegator', () => {
    const rows = Array.from({ length: DETAIL_DELEGATOR_CAP }, (_, i) => detailRow(i + 1, String(i + 1)));
    const view = fromDetail(detail(rows), 'desc')!;
    expect(view.partial).toBe(true);
    expect(view.fallback).toBe(true);
    expect(view.active).toBeNull();
  });

  it('knows a shorter list is the whole list, but still has no dates or thawing', () => {
    const view = fromDetail(detail([detailRow(1, '10'), detailRow(2, '20')]), 'desc')!;
    expect(view.partial).toBe(false);
    expect(view.active).toBe(2);
    expect(view.rows[0].delegatedAt).toBeNull();
    expect(view.rows[0].thawingTokens).toBeNull();
  });

  it('sorts by shares as exact integers, in both directions', () => {
    const rows = [detailRow(1, '9007199254740993000000'), detailRow(2, '9007199254740993000001'), detailRow(3, '1')];
    expect(fromDetail(detail(rows), 'desc')!.rows.map((r) => r.delegator)).toEqual([addr(2), addr(1), addr(3)]);
    expect(fromDetail(detail(rows), 'asc')!.rows.map((r) => r.delegator)).toEqual([addr(3), addr(1), addr(2)]);
  });

  it('values by shares, not by what was ever delegated in', () => {
    const view = fromDetail(detail([detailRow(1, POOL.delegatorShares)]), 'desc')!;
    expect(view.rows[0].currentTokens).toBe(POOL.delegatedTokens);
  });

  it('has nothing to fall back to when the section was left out', () => {
    expect(fromDetail({ delegators: undefined, ...POOL }, 'desc')).toBeNull();
  });
});

describe('delegatorsTabLabel', () => {
  it('uses the count kittiwake gives', () => {
    expect(delegatorsTabLabel({ delegatorCount: 106544, delegators: [] })).toBe('Delegators (106,544)');
  });

  it('gives a floor, not a count, for a capped list', () => {
    const rows = Array.from({ length: DETAIL_DELEGATOR_CAP }, (_, i) => detailRow(i + 1, '1'));
    expect(delegatorsTabLabel({ delegators: rows })).toBe('Delegators (100+)');
    expect(delegatorsTabLabel({ delegators: [detailRow(1, '1')] })).toBe('Delegators (1)');
  });

  it('claims no count when the list could not be read', () => {
    expect(delegatorsTabLabel({ delegators: undefined })).toBe('Delegators');
  });
});

describe('collectDelegators', () => {
  const row = (n: number) =>
    ({ id: `p${n}`, delegator: { id: `0x${n}` }, shareAmount: '1', currentTokens: '0', totalDelegatedTokens: '0', thawingTokens: '0', thawingUntil: null, lockedTokens: '0', delegatedAt: null, lastChangeAt: null });
  const served = (count: number) => async (first: number, skip: number) => ({
    delegators: Array.from({ length: Math.max(0, Math.min(first, count - skip)) }, (_, i) => row(skip + i)),
    total: count,
    active: count,
    pool: null,
  });

  it('pages until the list ends', async () => {
    expect(await collectDelegators(served(2_500))).toHaveLength(2_500);
  });

  it('stops at the cap for the largest indexers', async () => {
    const calls: number[] = [];
    const rows = await collectDelegators(async (first, skip) => { calls.push(skip); return served(106_652)(first, skip); });
    expect(rows).toHaveLength(DELEGATOR_EXPORT_CAP);
    expect(calls).toEqual([0, 1_000, 2_000, 3_000, 4_000]);
  });

  it('fails rather than exporting nothing when the route is not served', async () => {
    await expect(collectDelegators(async () => null)).rejects.toThrow();
  });

  it('writes one row per delegator with exact GRT and ISO dates', () => {
    const csv = delegatorsCsv([{ ...row(1), currentTokens: '1500000000000000000', delegatedAt: 1_700_000_000 }]);
    const [header, line] = csv.split('\n');
    expect(header.startsWith('rank,delegator,current_grt')).toBe(true);
    expect(line).toContain('1.5');
    expect(line).toContain('2023-11-14T22:13:20.000Z');
  });
});
