import { describe, expect, it } from 'vitest';
import { planCommands, simulateAllocation, type SimCandidate, type SimOptions } from '../allocation-simulator';

const dep = (ipfsHash: string, signal: number, stake: number, extra: Partial<SimCandidate> = {}): SimCandidate => ({
  ipfsHash, displayName: null, network: 'mainnet', signal, stake, ...extra,
});

const opts = (o: Partial<SimOptions> = {}): SimOptions => ({
  budget: 1_000_000,
  annualIssuance: 100_000_000,
  totalSignal: 1_000_000,
  minSignal: 100,
  maxPerDeployment: null,
  minAllocation: 1_000,
  excludeNetworks: [],
  skip: [],
  pinned: [],
  countCurrent: true,
  ...o,
});

describe('simulateAllocation', () => {
  it('places the whole budget and levels the marginal reward across deployments', () => {
    const plan = simulateAllocation([dep('QmA', 4_000, 1_000_000), dep('QmB', 1_000, 1_000_000)], [], opts({ budget: 3_000_000 }));
    expect(plan.placed).toBeGreaterThan(2_999_000);
    const [a, b] = ['QmA', 'QmB'].map((h) => plan.rows.find((r) => r.ipfsHash === h)!.proposed);
    // Equal marginals k·O/(O+y)² give y = sqrt(k·O/λ) − O, so four times the signal is twice O + y.
    expect((1_000_000 + a) / (1_000_000 + b)).toBeCloseTo(2, 1);
  });

  it('gives an unserved deployment the minimum allocation and nothing more', () => {
    const plan = simulateAllocation([dep('QmU', 1_000, 0), dep('QmA', 1_000, 1_000_000)], [], opts({ minAllocation: 5_000 }));
    const u = plan.rows.find((r) => r.ipfsHash === 'QmU')!;
    expect(u.proposed).toBe(5_000);
    expect(u.annualRewards).toBeCloseTo(100_000);
  });

  it('respects the per-deployment cap, the signal floor, skipped, denied and excluded networks', () => {
    const plan = simulateAllocation([
      dep('QmA', 1_000, 1_000_000),
      dep('QmLow', 50, 0),
      dep('QmSkip', 1_000, 0),
      dep('QmDenied', 1_000, 0, { deniedSince: 123 }),
      dep('QmBase', 1_000, 0, { network: 'base' }),
    ], [], opts({ maxPerDeployment: 200_000, skip: ['QmSkip'], excludeNetworks: ['base'] }));
    expect(plan.rows.map((r) => r.ipfsHash)).toEqual(['QmA']);
    expect(plan.rows[0].proposed).toBe(200_000);
  });

  it('opens a pinned deployment even below the signal floor', () => {
    const plan = simulateAllocation([dep('QmLow', 50, 10_000_000), dep('QmA', 1_000, 0)], [], opts({ pinned: ['QmLow'], budget: 1_000 }));
    expect(plan.rows.find((r) => r.ipfsHash === 'QmLow')?.proposed).toBe(1_000);
  });

  it('keeps current allocations and adds on top when they count as placed', () => {
    const own = [{ id: '0xa1', ipfsHash: 'QmA', amount: 500_000 }];
    const plan = simulateAllocation([dep('QmA', 1_000, 1_500_000), dep('QmB', 1_000, 1_000_000)], own, opts());
    const a = plan.rows.find((r) => r.ipfsHash === 'QmA')!;
    expect(a.current).toBe(500_000);
    expect(a.proposed).toBeGreaterThanOrEqual(500_000);
    expect(plan.placed).toBeGreaterThan(1_499_000);
    expect(plan.currentAnnualRewards).toBeCloseTo(100_000_000 * 0.001 * 500_000 / 1_500_000);
  });

  it('closes what a clean-sheet plan leaves out', () => {
    const own = [{ id: '0xlow', ipfsHash: 'QmLow', amount: 10_000 }];
    const plan = simulateAllocation([dep('QmLow', 50, 10_000), dep('QmA', 1_000, 1_000_000)], own, opts({ countCurrent: false }));
    expect(plan.commands).toContain('graph indexer actions queue unallocate QmLow 0xlow --network arbitrum-one');
    expect(plan.commands.some((l) => l.startsWith('graph indexer actions queue allocate QmA '))).toBe(true);
  });
});

describe('planCommands', () => {
  it('allocates new, resizes changed, unallocates dropped and leaves unchanged alone', () => {
    const own = [
      { id: '0xb', ipfsHash: 'QmB', amount: 100 },
      { id: '0xc', ipfsHash: 'QmC', amount: 100 },
      { id: '0xd', ipfsHash: 'QmD', amount: 100 },
    ];
    const row = (ipfsHash: string, current: number, proposed: number) => ({ ipfsHash, displayName: null, current, proposed, annualRewards: 0, apr: 0 });
    expect(planCommands([row('QmA', 0, 50), row('QmB', 100, 300), row('QmC', 100, 0), row('QmD', 100, 100)], own)).toEqual([
      'graph indexer actions queue allocate QmA 50 --network arbitrum-one',
      'graph indexer actions queue resize QmB 0xb 300 --network arbitrum-one',
      'graph indexer actions queue unallocate QmC 0xc --network arbitrum-one',
    ]);
  });
});
