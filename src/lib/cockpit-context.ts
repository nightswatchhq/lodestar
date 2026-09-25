/**
 * What the Cockpit shows beside a queued action (#259, B5), from public data only: the deployment's
 * denial and signal, what an allocation there would earn, what a close collects, and whether this
 * indexer's last POI there agreed with consensus.
 */

import type { SubgraphDeployment } from '@/lib/api';
import type { ActiveAllocation } from '@/lib/contracts/indexer-detail';
import type { POIDeploymentDetail } from '@/lib/poi';
import { estimatedAllocationApr } from '@/lib/allocation-estimate';
import { closeGate, closes, type AgentAction, type CloseGate, type CockpitActionType } from '@/lib/cockpit';
import { weiToGRT } from '@/lib/utils';

export interface ActionContext {
  name: string | null;
  denied: boolean;
  signalGrt: number | null;
  /** Percent a year before cuts, for the amount the action opens. Null when it opens nothing. */
  estimatedApr: number | null;
  /** GRT the allocation this action closes would collect now, before cuts. */
  accruedGrt: number | null;
  /** Only for closes; null when the action opens an allocation. */
  poi: CloseGate | null;
}

function isCockpitType(t: string): t is CockpitActionType {
  return t === 'allocate' || t === 'unallocate' || t === 'reallocate';
}

export function actionContext(opts: {
  action: Pick<AgentAction, 'type' | 'allocationID' | 'amount'>;
  deployment: SubgraphDeployment | null;
  allocations: ActiveAllocation[] | undefined;
  annualIssuance: number;
  totalSignalGrt: number;
  poiDetail: POIDeploymentDetail | null | undefined;
  indexer: string;
}): ActionContext {
  const { action, deployment } = opts;
  const own = action.allocationID
    ? opts.allocations?.find((a) => a.id.toLowerCase() === action.allocationID!.toLowerCase())
    : undefined;
  const signalGrt = deployment ? weiToGRT(deployment.signalledTokens) : null;
  const denied = (deployment?.deniedSince ?? 0) > 0;

  let estimatedApr: number | null = null;
  const amount = Number(action.amount);
  if ((action.type === 'allocate' || action.type === 'reallocate') && deployment && amount > 0 && !denied) {
    // A reallocate closes its old allocation first, so that stake is not competing with the new one.
    const others = weiToGRT(deployment.stakedTokens) - (own ? weiToGRT(own.allocatedTokens) : 0);
    estimatedApr = estimatedAllocationApr(opts.annualIssuance, signalGrt ?? 0, opts.totalSignalGrt, Math.max(0, others), amount);
  } else if (denied && (action.type === 'allocate' || action.type === 'reallocate')) {
    estimatedApr = 0;
  }

  const accruedGrt = own?.pendingRewards != null ? weiToGRT(own.pendingRewards) : null;
  const poi = isCockpitType(action.type) && closes(action.type) && opts.poiDetail !== undefined
    ? closeGate(opts.poiDetail, opts.indexer)
    : null;

  return { name: deployment?.displayName ?? null, denied, signalGrt, estimatedApr, accruedGrt, poi };
}
