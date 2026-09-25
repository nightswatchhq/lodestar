/**
 * `data.node` on `/api/indexer-status`: what kittiwake's probe of the indexer's own node found.
 *
 * kittiwake#152 stops the route waiting on that node. A request waits two seconds, then serves the
 * last probe result and its age while the probe finishes in the background. The per-deployment
 * statuses were left as they were for compatibility, so during a first probe every deployment reads
 * `unreachable` with nothing behind it. This block is how a caller tells the two apart.
 */
export interface IndexerNode {
  reachable: boolean | null;
  checkedAt: number | null;
  ageSeconds: number | null;
  stale: boolean;
  lastReachedAt: number | null;
  error: string | null;
  pending: boolean;
}

export type NodeState =
  | { kind: 'checking'; note: string }
  | { kind: 'reachable'; note: string | null }
  | { kind: 'unreachable'; note: string };

/** Seconds, as words. */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

/**
 * How long since the node last answered, from the payload's own fields rather than the browser
 * clock: `checkedAt - lastReachedAt` is the gap the server measured, and `ageSeconds` is how long
 * ago it measured it.
 */
function sinceLastReached(node: IndexerNode): number | null {
  if (node.lastReachedAt == null || node.checkedAt == null) return null;
  return node.checkedAt - node.lastReachedAt + (node.ageSeconds ?? 0);
}

/**
 * What to say about the node, or null when the answer carries no `node` block at all.
 *
 * A pending first probe is not an unreachable node, which is the whole point: lodestar#238.
 */
export function nodeState(node: IndexerNode | null | undefined): NodeState | null {
  if (!node) return null;
  if (node.reachable === false) {
    const since = sinceLastReached(node);
    return {
      kind: 'unreachable',
      note: since == null ? 'never reached' : `last reached ${formatAge(since)} ago`,
    };
  }
  if (node.reachable === true) {
    const age = node.ageSeconds;
    return { kind: 'reachable', note: node.stale && age != null ? `as of ${formatAge(age)} ago` : null };
  }
  // No verdict either way, whether or not a probe is still running. `pending` on its own does not
  // license calling a node unreachable, and neither does a `reachable` nobody has set.
  return { kind: 'checking', note: 'still asking this indexer’s node' };
}
