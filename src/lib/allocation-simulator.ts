/**
 * The allocation simulator (#254): spread an amount of GRT over deployments by water-filling on the
 * marginal reward from `allocation-estimate`, then diff the plan against the allocations already
 * open to get indexer-cli lines.
 *
 * An indexer holding `y` of a deployment's stake, with `O` held by everyone else, earns
 * `annual issuance × signal ÷ network signal × y ÷ (O + y)` a year. That is concave in `y` except
 * at zero on a deployment nobody serves, where any allocation takes the whole share. A chunked
 * greedy handles both, which is why this is not the closed-form square-root allocation.
 */

import { queueCommand } from '@/lib/indexer-cli';

export interface SimCandidate {
  ipfsHash: string;
  displayName: string | null;
  network: string | null;
  /** GRT. */
  signal: number;
  /** GRT, every indexer's allocations including this one's. */
  stake: number;
  deniedSince?: number | null;
}

export interface OwnAllocation {
  id: string;
  ipfsHash: string;
  /** GRT. */
  amount: number;
}

export interface SimOptions {
  /** GRT to place on top of what counts as already placed. */
  budget: number;
  annualIssuance: number;
  totalSignal: number;
  minSignal: number;
  /** Cap on this indexer's total stake on one deployment, GRT. Null for none. */
  maxPerDeployment: number | null;
  /** The smallest allocation worth opening, GRT. */
  minAllocation: number;
  excludeNetworks: string[];
  skip: string[];
  /** Always get at least `minAllocation`, whatever the other filters say. */
  pinned: string[];
  /** Current allocations stay and the budget goes on top; otherwise the plan starts from nothing. */
  countCurrent: boolean;
}

export interface PlanRow {
  ipfsHash: string;
  displayName: string | null;
  current: number;
  proposed: number;
  annualRewards: number;
  /** Percent, on `proposed`. */
  apr: number;
}

export interface Plan {
  rows: PlanRow[];
  placed: number;
  annualRewards: number;
  /** What the allocations open now earn by the same formula. */
  currentAnnualRewards: number;
  commands: string[];
}

const STEPS = 400;

function yearly(k: number, others: number, y: number): number {
  if (y <= 0 || k <= 0) return 0;
  return (k * y) / (others + y);
}

export function simulateAllocation(candidates: SimCandidate[], own: OwnAllocation[], opts: SimOptions): Plan {
  const ownBy = new Map<string, number>();
  for (const a of own) ownBy.set(a.ipfsHash, (ownBy.get(a.ipfsHash) ?? 0) + a.amount);

  const skip = new Set(opts.skip);
  const pinned = new Set(opts.pinned);
  const excluded = new Set(opts.excludeNetworks);
  const shareRate = opts.totalSignal > 0 && opts.annualIssuance > 0 ? opts.annualIssuance / opts.totalSignal : 0;

  const byHash = new Map(candidates.map((c) => [c.ipfsHash, c]));
  const pool = candidates.filter((c) => {
    if (skip.has(c.ipfsHash) || (c.deniedSince != null && c.deniedSince > 0)) return false;
    if (pinned.has(c.ipfsHash)) return true;
    if (c.signal < opts.minSignal) return false;
    return !(c.network && excluded.has(c.network));
  });

  const slots = pool.map((c) => {
    const mine = ownBy.get(c.ipfsHash) ?? 0;
    return {
      c,
      k: shareRate * c.signal,
      others: Math.max(0, c.stake - mine),
      y: opts.countCurrent ? mine : 0,
    };
  });

  const cap = opts.maxPerDeployment ?? Infinity;
  const minAlloc = Math.max(1, opts.minAllocation);
  const chunk = Math.max(1, opts.budget / STEPS);
  let left = Math.max(0, opts.budget);

  for (const s of slots) {
    if (!pinned.has(s.c.ipfsHash) || s.y > 0) continue;
    const step = Math.min(minAlloc, cap);
    if (step > left) continue;
    s.y = step;
    left -= step;
  }

  while (left > 1e-6) {
    let best: (typeof slots)[number] | null = null;
    let bestStep = 0;
    let bestRate = 0;
    for (const s of slots) {
      const room = cap - s.y;
      if (room <= 0) continue;
      let step = s.y > 0 ? Math.min(chunk, left) : Math.max(minAlloc, chunk);
      step = Math.min(step, room);
      if (step > left || (s.y === 0 && step < minAlloc)) continue;
      const rate = (yearly(s.k, s.others, s.y + step) - yearly(s.k, s.others, s.y)) / step;
      if (rate > bestRate) {
        best = s;
        bestStep = step;
        bestRate = rate;
      }
    }
    if (!best) break;
    best.y += bestStep;
    left -= bestStep;
  }

  const rows: PlanRow[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    seen.add(s.c.ipfsHash);
    const current = ownBy.get(s.c.ipfsHash) ?? 0;
    const proposed = Math.floor(s.y);
    if (proposed <= 0 && current <= 0) continue;
    const annualRewards = yearly(s.k, s.others, proposed);
    rows.push({
      ipfsHash: s.c.ipfsHash,
      displayName: s.c.displayName,
      current,
      proposed,
      annualRewards,
      apr: proposed > 0 ? (100 * annualRewards) / proposed : 0,
    });
  }
  // Allocations on deployments the plan no longer considers: skipped, denied, filtered or unknown.
  for (const [hash, current] of ownBy) {
    if (seen.has(hash)) continue;
    const c = byHash.get(hash);
    const keep = opts.countCurrent;
    const others = c ? Math.max(0, c.stake - current) : 0;
    const k = c && !(c.deniedSince != null && c.deniedSince > 0) ? shareRate * c.signal : 0;
    const proposed = keep ? current : 0;
    const annualRewards = yearly(k, others, proposed);
    rows.push({
      ipfsHash: hash,
      displayName: c?.displayName ?? null,
      current,
      proposed,
      annualRewards,
      apr: proposed > 0 ? (100 * annualRewards) / proposed : 0,
    });
  }
  rows.sort((a, b) => b.proposed - a.proposed || b.current - a.current);

  let currentAnnualRewards = 0;
  for (const [hash, current] of ownBy) {
    const c = byHash.get(hash);
    if (!c || (c.deniedSince != null && c.deniedSince > 0)) continue;
    currentAnnualRewards += yearly(shareRate * c.signal, Math.max(0, c.stake - current), current);
  }

  return {
    rows,
    placed: rows.reduce((sum, r) => sum + r.proposed, 0),
    annualRewards: rows.reduce((sum, r) => sum + r.annualRewards, 0),
    currentAnnualRewards,
    commands: planCommands(rows, own),
  };
}

/**
 * indexer-cli lines that turn the open allocations into the plan. A changed deployment resizes its
 * largest allocation and leaves any others as they are, so the total lands on the plan.
 */
export function planCommands(rows: PlanRow[], own: OwnAllocation[]): string[] {
  const lines: string[] = [];
  for (const r of rows) {
    const mine = own.filter((a) => a.ipfsHash === r.ipfsHash).sort((a, b) => b.amount - a.amount);
    if (mine.length === 0) {
      if (r.proposed > 0) lines.push(queueCommand('allocate', { deploymentId: r.ipfsHash, amount: String(r.proposed) }));
      continue;
    }
    if (r.proposed <= 0) {
      for (const a of mine) lines.push(queueCommand('unallocate', { deploymentId: r.ipfsHash, allocationId: a.id }));
      continue;
    }
    if (Math.abs(r.proposed - r.current) < 1) continue;
    const [largest, ...rest] = mine;
    const target = Math.floor(r.proposed - rest.reduce((sum, a) => sum + a.amount, 0));
    if (target > 0) {
      lines.push(queueCommand('resize', { deploymentId: r.ipfsHash, allocationId: largest.id, amount: String(target) }));
    } else {
      for (const a of mine) lines.push(queueCommand('unallocate', { deploymentId: r.ipfsHash, allocationId: a.id }));
      lines.push(queueCommand('allocate', { deploymentId: r.ipfsHash, amount: String(r.proposed) }));
    }
  }
  return lines;
}

export const SIMULATOR_TOOLTIP =
  'Estimate before indexer cuts and fees. Each deployment earns annual RewardsManager issuance × deployment signal ÷ network signal × your stake on it ÷ (everyone else\'s stake + yours). The next chunk of GRT goes wherever it adds most, until the amount is placed. Other indexers moving will change it.';
