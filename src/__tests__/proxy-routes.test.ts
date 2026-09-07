import { describe, expect, it } from 'vitest';
import { MIGRATED as list, isMigrated } from '@/lib/migration';

/**
 * The list decides which routes leave Next for the Rust backend. Getting it wrong is quiet in both
 * directions: a route wrongly included 404s, and one wrongly excluded stays on the slow path while
 * everything still works. Neither shows up as an error, so both are tested.
 *
 * This used to read `src/proxy.ts` and re-implement the matcher against a regex over its source,
 * which meant the thing under test was a copy of the thing that ships. It now imports both, so a
 * change to the real matcher is a change to what these assertions run.
 */

describe('the migrated route list', () => {
  it('is not empty, which would silently disable the whole cutover', () => {
    expect(list.length).toBeGreaterThan(20);
  });

  /**
   * The bug a bare `startsWith` would introduce. `/api/indexers` is migrated and
   * `/api/indexers-enriched` is a different route; matching by prefix sends the second to a backend
   * path that does not exist and 404s a working panel.
   */
  it('does not let one route swallow another by prefix', () => {
    expect(isMigrated('/api/indexers')).toBe(true);
    expect(isMigrated('/api/indexers-enriched')).toBe(true);
    expect(isMigrated('/api/indexers-nonsense')).toBe(false);
    expect(isMigrated('/api/epochs')).toBe(true);
    expect(isMigrated('/api/epochs-of-doom')).toBe(false);
  });

  it('takes parameterised routes, one segment deep and no further', () => {
    expect(isMigrated('/api/indexer/0xabc')).toBe(true);
    expect(isMigrated('/api/indexer-status/0xabc')).toBe(true);
    expect(isMigrated('/api/apr-provenance/0xabc')).toBe(true);
  });

  /**
   * Three live faults, found by the migration inventory's cross-check on 7 September.
   *
   * `/api/indexer/` used to mean "everything under it", so the edge forwarded `.../pnl` and
   * `.../revenue` to a backend with no handler for either and both answered 404 in production,
   * while the Next handlers that would have served them sat one rewrite away. `present-poi` is
   * worse: it occupies the address slot, so kittiwake's `/api/indexer/{address}` handler took it
   * and answered `400 not a valid address` on a POST that submits a PoI.
   */
  it('does not forward the sub-routes kittiwake has no handler for', () => {
    expect(isMigrated('/api/indexer/0xabc/pnl')).toBe(false);
    expect(isMigrated('/api/indexer/0xabc/revenue')).toBe(false);
    expect(isMigrated('/api/indexer/present-poi')).toBe(false);
  });

  /**
   * These three shipped in the list and answered 200 with a payload the frontend could not read -
   * `/api/subgraph-history` returned `{allocations, signals}` where the page reads `{history}`.
   * They were never in the parity harness. Until the ports are finished they stay on Next, and this
   * test is what stops them drifting back in unnoticed. See nightswatchhq/kittiwake#23.
   */
  /**
   * One of the eight remains out. Its port needs the live serving probe and the multi-round
   * servability persistence, which is a subsystem rather than a shape. See kittiwake#23.
   */
  it('keeps indexing-status on Next until its port is finished', () => {
    expect(isMigrated('/api/indexing-status/QmAbc')).toBe(false);
  });

  it('has the seven finished ports back', () => {
    for (const path of [
      '/api/subgraph-curation/QmAbc',
      '/api/subgraph-history/QmAbc',
      '/api/grt-flow',
      '/api/sql/catalog',
      '/api/rewards-history',
      '/api/apr-provenance/0xabc',
      '/api/indexer-stake-history/0xabc',
    ]) {
      expect(isMigrated(path), `${path} is finished and should be routed`).toBe(true);
    }
  });

  /**
   * `/api/sql/query` and `/api/sql/catalog` have moved; `/api/sql/named` was never ported. The
   * catalogue went, came back when its shape turned out never to have been compared, and has gone
   * again now that it matches. Three routes under one prefix, which is why this is a list and not
   * a `startsWith`.
   */
  it('splits the sql routes rather than taking the prefix', () => {
    expect(isMigrated('/api/sql/query')).toBe(true);
    expect(isMigrated('/api/sql/catalog')).toBe(true);
    expect(isMigrated('/api/sql/named')).toBe(false);
  });
});
