import { NextRequest, NextResponse } from 'next/server';
import { cacheGet } from '@/lib/cache';
import { normaliseEnrichedResponse } from '@/lib/enriched-normalise';
import { SCORE_WEIGHTS } from '@/lib/risk-score';
import type { EnrichedIndexer } from '@/lib/enriched';

export type RecommendResponse = {
  indexer: EnrichedIndexer;
  score: number;
  reasons: string[];
};

// Which score dimensions each preference slider amplifies
const PREF_DIMS: Record<string, (keyof typeof SCORE_WEIGHTS)[]> = {
  returns:   ['delegatorAPY', 'delegatorCut'],
  stability: ['cutStability'],
  safety:    ['overDelegation', 'selfStake'],
  network:   ['queryVolume', 'allocationEfficiency', 'reo'],
};

function buildWeights(prefs: Record<string, number>): Record<string, number> {
  const w: Record<string, number> = { ...SCORE_WEIGHTS };

  for (const [pref, dims] of Object.entries(PREF_DIMS)) {
    const mult = (prefs[pref] ?? 5) / 5; // 0→0, 5→1, 10→2
    for (const dim of dims) w[dim] = (w[dim] ?? 0) * mult;
  }

  // Normalize so weights still sum to 100
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  if (total === 0) return w;
  const factor = 100 / total;
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v * factor]));
}

function computeScore(indexer: EnrichedIndexer, weights: Record<string, number>): number {
  const bd = indexer.scoreBreakdown as Record<string, number> | null | undefined;
  // **Kittiwake sends a composite `score` but not the per-dimension breakdown the sliders weight**
  // (#114). Two things went wrong here at once and both are worth naming: dereferencing the absent
  // breakdown threw, turning a clean 503 into a 500; and defaulting it to `{}` would have been
  // quietly worse - every indexer scores 0, and the "recommendation" becomes whichever one happened
  // to sort first, presented to a delegator as a considered pick.
  //
  // So fall back to the composite score, which is a real ranking, and let `buildReasons` say that
  // the preferences could not be applied.
  if (!bd) return indexer.score ?? 0;
  return Object.entries(weights).reduce(
    (sum, [dim, w]) => sum + ((bd[dim] ?? 0) * w) / 100,
    0,
  );
}

function buildReasons(indexer: EnrichedIndexer, weights: Record<string, number>): string[] {
  const bd = indexer.scoreBreakdown as Record<string, number> | null | undefined;

  // Without the breakdown the ranking is the composite score, so say so rather than dressing it up
  // as a preference-weighted pick the user's sliders influenced.
  if (!bd) {
    const reasons = [`Overall score ${(indexer.score ?? 0).toFixed(0)}/100`];
    if (indexer.delegatorAPR) reasons.push(`${indexer.delegatorAPR.toFixed(1)}% estimated APR`);
    if (indexer.effectiveCut !== null && indexer.effectiveCut !== undefined) {
      reasons.push(`${indexer.effectiveCut.toFixed(1)}% effective cut`);
    }
    reasons.push('Ranked on overall score; preference sliders need per-dimension data this feed does not carry');
    return reasons;
  }

  // Top 3 contributing dimensions
  const top = Object.entries(weights)
    .map(([dim, w]) => ({ dim, contribution: ((bd?.[dim] ?? 0) * w) / 100 }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3)
    .map(({ dim }) => dim);

  return top.map((dim) => {
    switch (dim) {
      case 'delegatorAPY': {
        const apy = indexer.rollingAPY30d ?? indexer.delegatorAPR;
        return `${apy.toFixed(1)}% estimated APR`;
      }
      case 'delegatorCut': {
        const share = ((1 - indexer.indexingRewardCut / 1_000_000) * 100).toFixed(0);
        return `${share}% delegator reward share`;
      }
      case 'cutStability': {
        const days = Math.floor((Date.now() / 1000 - indexer.lastDelegationParameterUpdate) / 86400);
        return days >= 180
          ? `Cut stable for ${Math.floor(days / 30)} months`
          : `Cut unchanged for ${days} days`;
      }
      case 'overDelegation':
        return `${indexer.delegationCapacity.utilizationPercent.toFixed(0)}% delegation capacity used`;
      case 'selfStake': {
        const k = Math.round(indexer.selfStakeGRT / 1000);
        return `${k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${k}K`} GRT self-staked`;
      }
      case 'reo':
        return 'REO eligible';
      case 'queryVolume': {
        const fees = indexer.queryFeesCollectedGRT;
        return fees >= 1000
          ? `${(fees / 1000).toFixed(0)}K GRT in query fees`
          : `${fees.toFixed(0)} GRT in query fees`;
      }
      case 'allocationEfficiency':
        return 'High allocation efficiency';
      case 'transparency':
        return indexer.ensName ? `ENS: ${indexer.ensName}` : 'Verified identity';
      case 'delegationTrend':
        return indexer.recentActivity.netFlowGRT > 0 ? 'Net delegation inflow (7d)' : 'Stable delegation (7d)';
      default:
        return '';
    }
  }).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  const prefs = {
    returns:   Math.min(10, Math.max(0, Number(sp.get('returns')   ?? 5))),
    stability: Math.min(10, Math.max(0, Number(sp.get('stability') ?? 5))),
    safety:    Math.min(10, Math.max(0, Number(sp.get('safety')    ?? 5))),
    network:   Math.min(10, Math.max(0, Number(sp.get('network')   ?? 5))),
  };

  // **The cache key is no longer authoritative** (#114). It was written by a platform cron that was
  // removed at the kittiwake cutover, so this route answered 503 "Indexer data not yet available"
  // for a day while `/api/indexers-enriched` served a hundred perfectly good rows - and `/delegate`
  // rendered its explainer with no recommendation and, because the page's error branch never fired,
  // no explanation either. The cache is kept as the fast path and the live route is the truth.
  let indexers = await cacheGet<EnrichedIndexer[]>('lodestar:indexers-enriched');

  if (!indexers?.length) {
    try {
      const res = await fetch(new URL('/api/indexers-enriched', req.url), {
        headers: { 'User-Agent': 'lodestar-recommend' },
      });
      if (res.ok) indexers = normaliseEnrichedResponse(await res.json()).indexers;
    } catch (e) {
      // Fall through to the 503 below, but say why in the log rather than only in the status.
      console.error('recommend: could not load enriched indexers:', e);
    }
  }

  if (!indexers?.length) {
    return NextResponse.json({ error: 'Indexer data not yet available' }, { status: 503 });
  }

  const eligible = indexers.filter(
    (i) =>
      i.reoStatus === 'eligible' &&
      i.delegationCapacity.utilizationPercent < 90 &&
      i.indexingRewardCut < 900_000,
  );

  if (!eligible.length) {
    return NextResponse.json({ error: 'No eligible indexers found' }, { status: 404 });
  }

  const weights = buildWeights(prefs);
  const ranked = eligible
    .map((i) => ({ indexer: i, score: computeScore(i, weights) }))
    .sort((a, b) => b.score - a.score);

  const count = Math.min(10, Math.max(1, Number(sp.get('count') ?? 1)));

  if (count === 1) {
    const { indexer, score } = ranked[0];
    return NextResponse.json(
      { indexer, score: Math.round(score), reasons: buildReasons(indexer, weights) } satisfies RecommendResponse,
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  }

  const candidates = ranked.slice(0, count).map(({ indexer, score }) => ({
    indexer,
    score: Math.round(score),
    reasons: buildReasons(indexer, weights),
  }));

  return NextResponse.json(
    { candidates },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}
