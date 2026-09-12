import { describe, it, expect } from 'vitest';

import {
  summariseNodeHealth,
  type DeploymentStatus,
  type NodeHealthResponse,
} from '../node-health';

function status(over: Partial<DeploymentStatus> = {}): DeploymentStatus {
  return {
    deployment: 'QmOne',
    network: 'mainnet',
    health: 'healthy',
    synced: true,
    latest_block: 100,
    chain_head_block: 100,
    blocks_behind: 0,
    ...over,
  };
}

function body(statuses: DeploymentStatus[], over: Partial<NodeHealthResponse> = {}): NodeHealthResponse {
  return { url: 'https://node', reachable: true, elapsed_ms: 10, statuses, ...over };
}

describe('summarising a node status endpoint', () => {
  it('counts deployments at chain head against the total', () => {
    const s = summariseNodeHealth(
      body([status(), status(), status({ synced: false, blocks_behind: 500 })]),
    );
    expect(s).toMatchObject({ totalDeployments: 3, syncedCount: 2, syncedPct: 67 });
  });

  /**
   * graph-node reports `synced: true` for a deployment frozen at a block by a fatal error. The
   * badge counted those as at chain head, which reports a broken indexer as a healthy one.
   */
  it('does not count a failed deployment as at chain head just because it says synced', () => {
    const s = summariseNodeHealth(body([status(), status({ health: 'failed', synced: true })]));
    expect(s.syncedCount).toBe(1);
    expect(s.syncedPct).toBe(50);
  });

  it('reports the worst lag among deployments that are behind, not ones that stopped', () => {
    const s = summariseNodeHealth(
      body([
        status({ synced: false, blocks_behind: 900 }),
        status({ synced: false, blocks_behind: 12 }),
        // Stopped, not lagging. Its block gap is not a statement about how far behind the node runs.
        status({ health: 'failed', synced: false, blocks_behind: 9_000_000 }),
      ]),
    );
    expect(s.worstBlocksBehind).toBe(900);
  });

  it('has no lag figure when nothing is behind', () => {
    expect(summariseNodeHealth(body([status(), status()])).worstBlocksBehind).toBeNull();
  });

  /**
   * The shape that produced the bug: the component declared `{ totalDeployments, syncedCount }`,
   * cast the body to it, and divided two undefineds. `undefined < 3` is false, so the guard that
   * should have skipped a small node let it straight through to `NaN`.
   */
  it('answers null rather than NaN when there is nothing to divide by', () => {
    const s = summariseNodeHealth(body([]));
    expect(s.syncedPct).toBeNull();
    expect(s.totalDeployments).toBe(0);
    expect(Number.isNaN(s.syncedPct as number)).toBe(false);
  });

  it('survives a body with no statuses array at all', () => {
    const s = summariseNodeHealth({ url: 'x', reachable: true, elapsed_ms: 1 } as NodeHealthResponse);
    expect(s).toMatchObject({ totalDeployments: 0, syncedCount: 0, syncedPct: null });
  });

  it('keeps an unreachable node unreachable', () => {
    expect(summariseNodeHealth(body([], { reachable: false })).reachable).toBe(false);
  });
});
