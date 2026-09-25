import { describe, expect, it } from 'vitest';
import { allocationComparison } from '../allocation-comparison';
import type { IndexerDetail } from '../contracts/indexer-detail';

const wei = (n: number) => `${n}000000000000000000`;

describe('allocation comparison', () => {
  it('groups repeat allocations and weights ratio and age by allocated stake', () => {
    const indexer = {
      allocations: [
        { allocatedTokens: wei(10), createdAtEpoch: 10, subgraphDeployment: { ipfsHash: 'A', signalledTokens: wei(20), stakedTokens: wei(100) } },
        { allocatedTokens: wei(30), createdAtEpoch: 20, subgraphDeployment: { ipfsHash: 'A', signalledTokens: wei(20), stakedTokens: wei(100) } },
        { allocatedTokens: wei(60), createdAtEpoch: 30, subgraphDeployment: { ipfsHash: 'B', signalledTokens: wei(50), stakedTokens: wei(100) } },
      ],
      closedAllocations: [
        { createdAtEpoch: 3, closedAtEpoch: 8, poi: '0x01' },
        { createdAtEpoch: 11, closedAtEpoch: 16, poi: '0x02' },
      ],
    } as IndexerDetail;
    const trends = { rewards: [{ totalIndexerRewards: wei(5) }], queryFees: [] } as never;
    const result = allocationComparison(indexer, trends, 40)!;
    expect([...result.deployments.entries()]).toEqual([['A', 40], ['B', 60]]);
    expect(result.topFiveShare).toBe(1);
    expect(result.weightedSignalStakeRatio).toBeCloseTo(0.38);
    expect(result.meanAllocationEpochs).toBeCloseTo(15);
    expect(result.meanCloseEpochs).toBe(5);
    expect(result.poiCloseCadenceEpochs).toBe(8);
    expect(result.rewardPerAllocatedGrt30d).toBeCloseTo(0.05);
  });

  it('does not turn missing allocation data into zero exposure', () => {
    expect(allocationComparison({} as IndexerDetail, null, null)).toBeNull();
  });
});
