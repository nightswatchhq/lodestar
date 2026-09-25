/**
 * Pure network/epoch math. No I/O — unit-tested.
 */

export type EpochStatus = 'Active' | 'Settling' | 'Distributing' | 'Finalized';

/**
 * Derive an epoch's lifecycle status from its number relative to the current
 * epoch. The network subgraph has no `status` field, so this is a derived
 * approximation matching Explorer's visual progression:
 *   current → Active, current-1 → Settling, current-2 → Distributing, older → Finalized.
 */
export function epochStatus(epochId: number, currentEpoch: number): EpochStatus {
  const age = currentEpoch - epochId;
  if (age <= 0) return 'Active';
  if (age === 1) return 'Settling';
  if (age === 2) return 'Distributing';
  return 'Finalized';
}

/**
 * Ethereum L1 blocks per year at the observed post-merge ~12.09s/block. The
 * Graph's rewards issuance is anchored to L1 block numbers.
 */
export const L1_BLOCKS_PER_YEAR = Math.round((365.25 * 24 * 3600) / 12.09);

/**
 * Days remaining until an indexer can next change its delegation parameters.
 * Returns 0 when no cooldown is configured or it has already elapsed.
 * All inputs in unix seconds.
 */
export function cooldownRemainingDays(
  cooldownSecs: number,
  lastUpdateSecs: number,
  nowSecs: number,
): number {
  if (cooldownSecs <= 0) return 0;
  const remaining = cooldownSecs - (nowSecs - lastUpdateSecs);
  return remaining > 0 ? remaining / 86400 : 0;
}

/**
 * Annualised GRT issuance as a percentage of total supply.
 * `issuancePerBlockGrt` and `totalSupplyGrt` are in whole GRT (not wei).
 * Returns 0 for non-positive supply.
 */
export function annualIssuancePercent(
  issuancePerBlockGrt: number,
  totalSupplyGrt: number,
  blocksPerYear: number = L1_BLOCKS_PER_YEAR,
): number {
  if (totalSupplyGrt <= 0 || issuancePerBlockGrt < 0) return 0;
  return ((issuancePerBlockGrt * blocksPerYear) / totalSupplyGrt) * 100;
}

/**
 * RewardsManager on Arbitrum One. Same address kittiwake labels "Indexing rewards (RewardsManager)".
 * Used only when `/api/dips` has not yet grown an `indexingRate` field.
 */
export const REWARDS_MANAGER = '0x971b9d3d0ae3eca029cab5ea1fb0f72c85e6a525';

/** The per-block GRT indexing rewards are paid from. Protocol-total issuance is larger since GIP-0089. */
export function indexingIssuancePerBlock(dips: {
  indexingRate?: number;
  allocations?: Array<{ target: string; rate: number }>;
} | null | undefined): number {
  if (dips == null) return 0;
  if (dips.indexingRate != null && Number.isFinite(dips.indexingRate) && dips.indexingRate > 0) {
    return dips.indexingRate;
  }
  const row = dips.allocations?.find(
    (a) => a.target.toLowerCase() === REWARDS_MANAGER,
  );
  return row != null && Number.isFinite(row.rate) && row.rate > 0 ? row.rate : 0;
}

export function annualIndexingIssuance(
  perBlockGrt: number,
  blocksPerYear: number = L1_BLOCKS_PER_YEAR,
): number {
  if (perBlockGrt <= 0) return 0;
  return perBlockGrt * blocksPerYear;
}
