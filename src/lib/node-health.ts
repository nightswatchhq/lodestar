/**
 * Summarise an indexer node's status endpoint into the one figure a badge can carry.
 *
 * ## Why this exists
 *
 * `/api/indexer-node-health` answers `{ url, reachable, elapsed_ms, statuses: [...] }`, where
 * `statuses` is one row per deployment - 4,889 of them on the indexer this was found on. The table
 * declared a type of `{ reachable, totalDeployments, syncedCount, worstBlocksBehind }` and cast the
 * body to it. The cast compiled, the fields were undefined at runtime, and the guard meant to skip
 * small nodes was `totalDeployments < 3`, which is `false` for `undefined`. So it fell through to
 * `Math.round(undefined / undefined * 100)` and the Indexer Directory rendered a
 * **"Sync Warning: NaN%"** badge, with a tooltip reading "NaN% of deployments at chain head".
 *
 * ## What counts as at chain head
 *
 * Not `synced` on its own. graph-node reports `synced: true` for a deployment frozen at a block by
 * a fatal error, so counting those would report a broken indexer as a healthy one - the same
 * confusion `fatalError.deterministic` exists to settle. A deployment is at chain head here when
 * graph-node calls it `healthy` **and** `synced`.
 *
 * The lag figure is the worst among deployments that are healthy and merely behind. A failed one
 * is not lagging, it is stopped, and rolling the two together would put a stopped deployment's
 * block gap into a sentence about how far behind the node is running.
 */

export interface DeploymentStatus {
  deployment: string;
  network: string | null;
  health: 'healthy' | 'unhealthy' | 'failed' | string;
  synced: boolean;
  latest_block: number | null;
  chain_head_block: number | null;
  blocks_behind: number | null;
}

export interface NodeHealthResponse {
  url: string;
  reachable: boolean;
  elapsed_ms: number;
  error?: string | null;
  statuses: DeploymentStatus[];
}

export interface NodeSyncSummary {
  reachable: boolean;
  totalDeployments: number;
  syncedCount: number;
  /** Percent of deployments at chain head, or null when there are none to divide by. */
  syncedPct: number | null;
  /** Worst lag among deployments that are healthy and behind, or null when none are. */
  worstBlocksBehind: number | null;
}

/** Deployments too few to say anything about. Below this the badge stays off. */
export const MIN_DEPLOYMENTS_TO_JUDGE = 3;

export function summariseNodeHealth(body: NodeHealthResponse): NodeSyncSummary {
  const statuses = Array.isArray(body.statuses) ? body.statuses : [];
  const total = statuses.length;
  const synced = statuses.filter((s) => s.synced && s.health === 'healthy').length;

  const lagging = statuses
    .filter((s) => s.health === 'healthy' && !s.synced)
    .map((s) => s.blocks_behind ?? 0);

  return {
    reachable: Boolean(body.reachable),
    totalDeployments: total,
    syncedCount: synced,
    // Null rather than 0 or NaN: a node with no deployments has no percentage, and both of the
    // other answers are sentences a badge would happily render.
    syncedPct: total > 0 ? Math.round((synced / total) * 100) : null,
    worstBlocksBehind: lagging.length ? Math.max(...lagging) : null,
  };
}
