import type { ActiveAllocation } from '@/lib/contracts/indexer-detail';

export type StatusDeployment = {
  deploymentId: string;
  ipfsHash: string;
  displayName: string | null;
  allocatedTokens: string;
  signalledTokens: string;
  stakedTokens: string;
  createdAtEpoch: number;
  status: 'synced' | 'syncing' | 'failed' | 'unreachable';
  network?: string;
  blocksBehind?: number;
  syncProgress?: number;
  fatalError?: string;
};

export type AllocationRow = StatusDeployment & {
  allocationId: string;
  deniedSince?: number | null;
  pendingRewards?: string | null;
};

/**
 * One row per open allocation, with node status joined from `/api/indexer-status`.
 * Status is keyed by deployment and has no allocation ID, so two open allocations
 * on one deployment must not collapse to one row.
 */
export function allocationsWithStatus(
  allocations: ActiveAllocation[],
  deployments: StatusDeployment[] | undefined,
): AllocationRow[] {
  const byDeployment = new Map<string, StatusDeployment>();
  for (const d of deployments ?? []) {
    byDeployment.set(d.deploymentId.toLowerCase(), d);
  }

  return allocations.map((a) => {
    const deploymentId = a.subgraphDeployment.id;
    const status = byDeployment.get(deploymentId.toLowerCase());
    return {
      allocationId: a.id,
      deploymentId,
      ipfsHash: a.subgraphDeployment.ipfsHash || status?.ipfsHash || '',
      displayName: a.subgraphDeployment.displayName ?? status?.displayName ?? null,
      allocatedTokens: a.allocatedTokens,
      signalledTokens: a.subgraphDeployment.signalledTokens,
      stakedTokens: a.subgraphDeployment.stakedTokens,
      createdAtEpoch: a.createdAtEpoch,
      status: status?.status ?? 'unreachable',
      network: status?.network,
      blocksBehind: status?.blocksBehind,
      syncProgress: status?.syncProgress,
      fatalError: status?.fatalError,
      pendingRewards: a.pendingRewards,
      deniedSince: a.subgraphDeployment.deniedSince,
    };
  });
}
