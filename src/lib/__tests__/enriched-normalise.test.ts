import { describe, it, expect } from 'vitest';
import { normaliseEnrichedResponse } from '../enriched-normalise';
import { weiToGRT } from '../utils';

/**
 * #114. `/api/indexers-enriched` answered 200 with a hundred healthy rows while every score, APR and
 * eligibility cell on `/indexers` rendered as a dash, because the cutover moved the payload from
 * `{ indexers }` to `{ data }` with renamed fields and nothing parsed it.
 *
 * A row taken from production on 2026-09-08, unedited.
 */
const KITTIWAKE_ROW = {
  address: '0x4e5c87772c29381bcabc58c3f182b6633b5a274a',
  allocatedGrt: '28825049',
  allocationCount: 82,
  delegatedGrt: '22661054.5458494',
  delegationCapacityPct: '14.6841985067869',
  delegationsIn7d: 6,
  delegatorApr: '16.035678036558',
  distinctDataServices: 1,
  effectiveCut: '54.9',
  geoHash: 'dhvqgxexh',
  lastUpdated: '2026-09-08T07:05:31.265458Z',
  netFlowGrt7d: '113773.901711093',
  reoStatus: 'eligible',
  rewardCut: '54.9',
  score: '81',
  scoreGrade: 'A',
  selfStakeGrt: '9645169.99999',
  undelegationsIn7d: 0,
  url: 'https://service.thegraph.data.nexus',
};

describe('normaliseEnrichedResponse', () => {
  it('maps the kittiwake payload onto the fields the table reads', () => {
    const { indexers } = normaliseEnrichedResponse({ data: [KITTIWAKE_ROW] });
    expect(indexers).toHaveLength(1);
    const e = indexers[0];

    // The four columns that rendered as "—" for all 80 indexers.
    expect(e.score).toBe(81);
    expect(e.scoreGrade).toBe('A');
    expect(e.delegatorAPR).toBeCloseTo(16.0357, 3);
    expect(e.effectiveCut).toBeCloseTo(54.9, 6);
    expect(e.reoStatus).toBe('eligible');

    // ...and the ones that were already rendering, which must not regress.
    expect(e.id).toBe(KITTIWAKE_ROW.address);
    expect(e.selfStakeGRT).toBeCloseTo(9645169.99999, 4);
    expect(e.delegationCapacity.utilizationPercent).toBeCloseTo(14.6842, 3);
    // PPM, not percent: the table renders this through `formatPPM` and the raw feed carries 549000
    // for this same indexer. Unscaled it would render 0.0055%.
    expect(e.indexingRewardCut).toBe(549_000);
    expect(e.recentActivity.delegationsIn7d).toBe(6);
  });

  it('converts GRT to wei, because the table reads allocatedTokens through weiToGRT', () => {
    const { indexers } = normaliseEnrichedResponse({ data: [KITTIWAKE_ROW] });
    // Passing GRT straight through would divide by 1e18 downstream and show every allocation as
    // zero - a wrong number, which is worse than the dash it replaces.
    expect(weiToGRT(indexers[0].allocatedTokens)).toBeCloseTo(28825049, 0);
  });

  it('keeps the reward-cut filter in /api/delegate/recommend meaningful', () => {
    // That route rejects `indexingRewardCut >= 900_000`. At percent scale every indexer passes,
    // including a 100% cut, and it would recommend one that pays delegators nothing.
    const { indexers } = normaliseEnrichedResponse({ data: [{ ...KITTIWAKE_ROW, rewardCut: '100' }] });
    expect(indexers[0].indexingRewardCut).toBe(1_000_000);
    expect(indexers[0].indexingRewardCut < 900_000).toBe(false);
  });

  it('passes the legacy envelope through untouched', () => {
    const legacy = { indexers: [{ id: '0xabc', score: 42 }], computedAt: 1234 };
    const out = normaliseEnrichedResponse(legacy);
    expect(out.computedAt).toBe(1234);
    expect(out.indexers[0]).toEqual(legacy.indexers[0]);
  });

  it('throws on a shape it does not recognise, naming the keys it got', () => {
    // The whole point. The previous cast returned `{ results: [...] }` as if it were
    // `{ indexers: [...] }`, and the table quietly rendered its fallback for a day.
    expect(() => normaliseEnrichedResponse({ results: [] }))
      .toThrow(/unrecognised response shape.*results/s);
    expect(() => normaliseEnrichedResponse(null)).toThrow(/not an object/);
  });

  it('rejects rows under "data" that are not the kittiwake shape', () => {
    expect(() => normaliseEnrichedResponse({ data: [{ nope: 1 }] })).toThrow(/not the kittiwake shape/);
  });

  it('does not invent an eligibility it was not given', () => {
    const { indexers } = normaliseEnrichedResponse({ data: [{ ...KITTIWAKE_ROW, reoStatus: 'garbage' }] });
    expect(indexers[0].reoStatus).toBe('unknown');
  });
});
