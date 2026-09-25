/** The marginal APR of one more allocation, before indexer and delegator cuts. */
export function estimatedAllocationApr(
  annualIssuanceGrt: number,
  deploymentSignalGrt: number,
  totalSignalGrt: number,
  existingDeploymentStakeGrt: number,
  newAllocationGrt = 100_000,
): number | null {
  if (!(annualIssuanceGrt > 0) || !(totalSignalGrt > 0) || !(newAllocationGrt > 0)
    || deploymentSignalGrt < 0 || existingDeploymentStakeGrt < 0
    || ![annualIssuanceGrt, deploymentSignalGrt, totalSignalGrt, existingDeploymentStakeGrt, newAllocationGrt].every(Number.isFinite)) {
    return null;
  }
  return 100 * annualIssuanceGrt * deploymentSignalGrt
    / totalSignalGrt / (existingDeploymentStakeGrt + newAllocationGrt);
}

export const ALLOCATION_ESTIMATE_TOOLTIP =
  'Estimate before indexer cuts and fees: annual RewardsManager issuance × deployment signal ÷ network signal × new allocation ÷ (existing deployment stake + new allocation). APR divides those rewards by the new allocation. Other allocations can change it.';
