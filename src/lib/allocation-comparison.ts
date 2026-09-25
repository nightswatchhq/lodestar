import type { IndexerDetail } from './contracts/indexer-detail';
import type { IndexerTrendsResponse } from './contracts/indexer-trends';
import { weiToGRT } from './utils';

export interface AllocationComparison {
  allocatedGrt: number;
  topFiveShare: number | null;
  weightedSignalStakeRatio: number | null;
  meanAllocationEpochs: number | null;
  meanCloseEpochs: number | null;
  poiCloseCadenceEpochs: number | null;
  rewardPerAllocatedGrt30d: number | null;
  deployments: Map<string, number>;
}

/** Aggregate by deployment first: several allocations on one deployment count as one exposure. */
export function allocationComparison(
  indexer: IndexerDetail,
  trends: IndexerTrendsResponse | null,
  currentEpoch: number | null,
): AllocationComparison | null {
  if (!indexer.allocations) return null;
  const allocations = indexer.allocations;
  const deployments = new Map<string, number>();
  let allocatedGrt = 0;
  let weightedRatio = 0;
  let ratioWeight = 0;
  let weightedAge = 0;

  for (const allocation of allocations) {
    const stake = weiToGRT(allocation.allocatedTokens);
    if (!(stake > 0)) continue;
    const hash = allocation.subgraphDeployment.ipfsHash;
    deployments.set(hash, (deployments.get(hash) ?? 0) + stake);
    allocatedGrt += stake;

    const signal = weiToGRT(allocation.subgraphDeployment.signalledTokens);
    const deploymentStake = weiToGRT(allocation.subgraphDeployment.stakedTokens);
    if (deploymentStake > 0 && Number.isFinite(signal)) {
      weightedRatio += stake * signal / deploymentStake;
      ratioWeight += stake;
    }
    if (currentEpoch != null && allocation.createdAtEpoch <= currentEpoch) {
      weightedAge += stake * (currentEpoch - allocation.createdAtEpoch);
    }
  }

  const topFive = [...deployments.values()].sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
  const closed = indexer.closedAllocations?.filter((a) => a.closedAtEpoch != null && a.closedAtEpoch >= a.createdAtEpoch) ?? [];
  const closeEpochs = closed.reduce((sum, a) => sum + a.closedAtEpoch! - a.createdAtEpoch, 0);
  const poiEpochs = closed.filter((a) => a.poi && a.closedAtEpoch != null).map((a) => a.closedAtEpoch!).sort((a, b) => a - b);
  const rewards = trends?.rewards.reduce((sum, day) => sum + weiToGRT(day.totalIndexerRewards), 0);

  return {
    allocatedGrt,
    topFiveShare: allocatedGrt > 0 ? topFive / allocatedGrt : null,
    weightedSignalStakeRatio: ratioWeight > 0 ? weightedRatio / ratioWeight : null,
    meanAllocationEpochs: allocatedGrt > 0 && currentEpoch != null ? weightedAge / allocatedGrt : null,
    meanCloseEpochs: closed.length > 0 ? closeEpochs / closed.length : null,
    poiCloseCadenceEpochs: poiEpochs.length > 1
      ? (poiEpochs[poiEpochs.length - 1] - poiEpochs[0]) / (poiEpochs.length - 1) : null,
    rewardPerAllocatedGrt30d: allocatedGrt > 0 && rewards != null ? rewards / allocatedGrt : null,
    deployments,
  };
}
