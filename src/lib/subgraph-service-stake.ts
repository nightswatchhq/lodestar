import type { Provision } from '@/lib/queries';
import { weiToGRT } from '@/lib/utils';

/** SubgraphService. The provision every subgraph allocation starts from. */
export const SUBGRAPH_SERVICE_ID = '0xb2bb92d0de618878e438b55d5846cfecd9301105';

export type SubgraphServiceStake = {
  provisioned: number;
  allocated: number;
  thawing: number;
  available: number;
  allocationRatio: number | null;
};

/**
 * Unallocated tokens on the SubgraphService provision, floored at 0.
 * `tokensAllocated` includes delegated stake; `tokensProvisioned` does not, so available
 * adds active delegation. Missing provision is null, not zero.
 */
export function subgraphServiceStake(
  provisions: Provision[],
  delegatedGRT: number,
): SubgraphServiceStake | null {
  const provision = provisions.find(
    (p) => p.dataService.id.toLowerCase() === SUBGRAPH_SERVICE_ID,
  );
  if (!provision) return null;

  const provisioned = weiToGRT(provision.tokensProvisioned);
  const allocated = weiToGRT(provision.tokensAllocated);
  const thawing = weiToGRT(provision.tokensThawing);
  const pool = provisioned + delegatedGRT;
  return {
    provisioned,
    allocated,
    thawing,
    available: Math.max(0, pool - allocated - thawing),
    allocationRatio: pool > 0 ? allocated / pool : null,
  };
}

/** Ungrouped GRT for the clipboard. `formatGRT` abbreviates; `formatGRTFull` inserts commas. */
export function plainGRT(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  return amount.toLocaleString('en-US', {
    useGrouping: false,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
}
