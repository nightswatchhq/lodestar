import type { EnrichedIndexer } from '@/lib/enriched';

/**
 * Turn whatever `/api/indexers-enriched` answers into `EnrichedIndexer[]`.
 *
 * **Parse, do not assert.** `fetchEnrichedIndexers` used to declare
 * `Promise<{ indexers: EnrichedIndexer[]; computedAt: number }>` and then `return response.json()`.
 * That is a compile-time claim about a runtime payload nobody checked, so when the kittiwake cutover
 * moved the route from `{ indexers, computedAt }` to `{ data: [...] }` with renamed fields, `tsc`
 * stayed green, the request stayed `200`, and `IndexerTable` silently fell through to its degraded
 * branch - rendering a full table of dashes for all 80 indexers for a day (#114).
 *
 * So this recognises both envelopes and **throws on one it does not know**. A loud failure sends the
 * table to its fallback *and* puts a message in the console; a quiet one just looks slightly wrong
 * forever, which is what happened.
 */

/** Kittiwake's row. Named fields only - anything absent is handled explicitly below. */
interface KittiwakeRow {
  address: string;
  url: string | null;
  selfStakeGrt: string;
  delegatedGrt: string;
  delegationCapacityPct: string;
  rewardCut: string;
  effectiveCut: string;
  delegatorApr: string;
  score: string | null;
  scoreGrade: string | null;
  reoStatus: string | null;
  allocationCount: number;
  allocatedGrt: string;
  delegationsIn7d: number;
  undelegationsIn7d: number;
  netFlowGrt7d: string;
  geoHash: string | null;
  // Both NUMERIC in Postgres and so sent as text, and both genuinely nullable: the refresh
  // job writes null where it has no figure. Added kittiwake#38.
  queryFeesCollectedGrt?: string | null;
  rewardsEarnedGrt?: string | null;
  rollingApy30d?: string | null;
  rollingApy90d?: string | null;
  lastUpdated?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * GRT back to wei, because `IndexerTable` reads `allocatedTokens` through `weiToGRT`.
 *
 * Kittiwake sends GRT already. Passing it straight through would divide by 1e18 downstream and show
 * every allocation as zero - a wrong number, which is worse than the dash it replaces.
 */
const grtToWei = (grt: string | number): string => {
  const [whole, frac = ''] = String(grt).split('.');
  const padded = (frac + '0'.repeat(18)).slice(0, 18);
  try {
    return (BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0')).toString();
  } catch {
    return '0';
  }
};

const REO = new Set(['eligible', 'ineligible', 'unknown']);

function fromKittiwake(r: KittiwakeRow): EnrichedIndexer {
  const capacity = num(r.delegationCapacityPct);
  const selfStake = num(r.selfStakeGrt);
  const delegated = num(r.delegatedGrt);
  return {
    id: String(r.address).toLowerCase(),
    // Absent upstream. `null` renders as the address, which is honest; a placeholder string would
    // read as a name the indexer chose.
    name: null as unknown as string,
    ensName: null,
    url: r.url ?? null,
    geoHash: r.geoHash ?? null,

    selfStakeGRT: selfStake,
    delegatedGRT: delegated,
    delegatedThawingGRT: 0,
    // These three are percentages at both ends (`.toFixed(2)}%` etc. at the render sites), so they
    // pass through unscaled. Only `indexingRewardCut` below differs, and it is the one that bites.
    delegatorAPR: num(r.delegatorApr),
    effectiveCut: num(r.effectiveCut),
    // **Percent to PPM.** `IndexerTable` renders this through `formatPPM`, and the raw feed carries
    // 549000 for the indexer kittiwake reports as "54.9". Passed through unscaled it renders
    // 0.0055% - a confidently wrong number, which is worse than the dash it replaces. The same
    // scale is what `/api/delegate/recommend`'s `indexingRewardCut < 900_000` filter assumes; at
    // percent scale that comparison is always true and it would recommend a 100%-cut indexer.
    indexingRewardCut: Math.round(num(r.rewardCut) * 10_000),
    allocationCount: num(r.allocationCount),
    allocatedTokens: grtToWei(r.allocatedGrt ?? '0'),
    delegationCapacity: {
      maxCapacity: 0,
      usedCapacity: 0,
      availableCapacity: 0,
      utilizationPercent: capacity,
    },
    reoStatus: (REO.has(String(r.reoStatus)) ? r.reoStatus : 'unknown') as EnrichedIndexer['reoStatus'],
    recentActivity: {
      delegationsIn7d: num(r.delegationsIn7d),
      undelegationsIn7d: num(r.undelegationsIn7d),
      netFlowGRT: num(r.netFlowGrt7d),
    },
    score: r.score === null || r.score === undefined ? null : num(r.score),
    scoreGrade: (r.scoreGrade ?? null) as EnrichedIndexer['scoreGrade'],

    // Absent upstream, and left absent on purpose: `computeScore` in /api/delegate/recommend
    // distinguishes "no breakdown" from "a breakdown of zeroes", and an empty object would make
    // every indexer score 0 and the recommendation arbitrary.
    scoreBreakdown: null,

    // **Not sent by kittiwake.** Left null/zero deliberately so the Cooldown column renders as
    // "—" rather than as a confident wrong number. Restoring them is a backend change; see the
    // field inventory in #114.
    queryFeeCut: 0,
    delegatorParameterCooldown: 0,
    lastDelegationParameterUpdate: 0,

    // Sent since kittiwake#41. Null where the indexer has neither pool growth nor closed
    // allocations in the window, which is not the same as an APY of zero.
    rollingAPY30d:
      r.rollingApy30d === null || r.rollingApy30d === undefined ? null : num(r.rollingApy30d),
    rollingAPY90d:
      r.rollingApy90d === null || r.rollingApy90d === undefined ? null : num(r.rollingApy90d),

    // Sent since kittiwake#38. Null is kept distinct from zero: an indexer that collected nothing
    // and one whose fees were never recorded are different answers, and the table renders the
    // second as a dash.
    queryFeesCollectedGRT:
      r.queryFeesCollectedGrt === null || r.queryFeesCollectedGrt === undefined
        ? null
        : num(r.queryFeesCollectedGrt),
    overDelegationDilution: null,
    reoSource: null,
    reoRenewalTimestamp: null,
    reoExpiresAt: null,
    reoDaysRemaining: null,
    stakedTokens: grtToWei(selfStake),
    delegatedTokens: grtToWei(delegated),
    lockedTokens: '0',
    rewardsEarned: grtToWei(r.rewardsEarnedGrt ?? '0'),
    delegatorShares: '0',
    createdAt: 0,
  } as unknown as EnrichedIndexer;
}

export interface EnrichedResponse {
  indexers: EnrichedIndexer[];
  computedAt: number;
}

export function normaliseEnrichedResponse(body: unknown): EnrichedResponse {
  if (!body || typeof body !== 'object') {
    throw new Error('indexers-enriched: response was not an object');
  }
  const b = body as Record<string, unknown>;

  // The shape this client was written against.
  if (Array.isArray(b.indexers)) {
    return { indexers: b.indexers as EnrichedIndexer[], computedAt: num(b.computedAt) };
  }

  // Kittiwake's shape since the cutover.
  if (Array.isArray(b.data)) {
    const rows = b.data as KittiwakeRow[];
    if (rows.length && !('address' in rows[0])) {
      throw new Error(
        `indexers-enriched: rows under "data" are not the kittiwake shape (keys: ${Object.keys(rows[0]).slice(0, 12).join(', ')})`,
      );
    }
    const computedAt = rows[0]?.lastUpdated ? Date.parse(rows[0].lastUpdated) : Date.now();
    return { indexers: rows.map(fromKittiwake), computedAt };
  }

  throw new Error(
    `indexers-enriched: unrecognised response shape (top-level keys: ${Object.keys(b).join(', ')}). ` +
      'The route changed contract; see src/lib/enriched-normalise.ts and #114.',
  );
}
