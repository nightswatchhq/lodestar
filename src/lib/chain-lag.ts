/**
 * The shape of the chain-lag answer, which the frontend and the rollback handler both read.
 *
 * These types used to live in `src/app/api/cron/refresh-chain-health/route.ts`, the cron that
 * computed them. That cron moved to kittiwake and the handler has been deleted, so the types would
 * have gone with it - which is the wrong reason for a type to disappear. A description of a payload
 * belongs beside the other descriptions of payloads, not inside one of the things that produces it.
 */

import type { ChainLiveness } from './chain-liveness';

export interface ChainStats {
  medianBlocksBehind: number;
  sampledIndexers: number;
  laggingCount: number;
  /**
   * Whether the chain is still producing blocks. `medianBlocksBehind` measures distance to head and
   * therefore reports zero for a chain that has stopped: every indexer is exactly at a head that no
   * longer moves. This is the absolute signal that survives that.
   */
  liveness: ChainLiveness;
  /** Highest block observed for this chain across sampled indexers. */
  observedHead: number | null;
  /** How long the head was watched failing to advance. Zero for a live chain. */
  headStalledForMs: number;
}

export interface ChainLagData {
  chains: Record<string, ChainStats>;
  computedAt: number;
}
