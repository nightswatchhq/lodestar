import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * The list in `proxy.ts` decides which routes leave Next for the Rust backend. Getting it wrong is
 * quiet in both directions: a route wrongly included 404s, and one wrongly excluded stays on the
 * slow path while everything still works. Neither shows up as an error, so both are tested.
 */
const source = readFileSync('src/proxy.ts', 'utf8');
const list: string[] = Array.from(source.matchAll(/^\s*'(\/api\/[^']*)',$/gm)).map((m) => m[1]);

function isMigrated(path: string): boolean {
  return list.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p));
}

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

  it('takes parameterised routes and everything under them', () => {
    expect(isMigrated('/api/indexer/0xabc')).toBe(true);
    expect(isMigrated('/api/indexer-status/0xabc')).toBe(true);
    expect(isMigrated('/api/subgraph-curation/QmAbc')).toBe(false);
  });

  /**
   * These three shipped in the list and answered 200 with a payload the frontend could not read -
   * `/api/subgraph-history` returned `{allocations, signals}` where the page reads `{history}`.
   * They were never in the parity harness. Until the ports are finished they stay on Next, and this
   * test is what stops them drifting back in unnoticed. See nightswatchhq/kittiwake#23.
   */
  it('keeps the eight unfinished ports on Next', () => {
    for (const path of [
      '/api/indexing-status/QmAbc',
      '/api/subgraph-curation/QmAbc',
      '/api/subgraph-history/QmAbc',
      '/api/grt-flow',
      '/api/sql/catalog',
      '/api/rewards-history',
      '/api/apr-provenance/0xabc',
      '/api/indexer-stake-history/0xabc',
    ]) {
      expect(isMigrated(path), `${path} is not a finished port`).toBe(false);
    }
  });

  /**
   * The product layer has not moved. If any of these ever match, the dashboard loses its sessions,
   * its chat and its disassembler in one deploy.
   */
  it('leaves everything that has not been ported on Next', () => {
    for (const path of [
      '/api/studio/auth',
      '/api/studio/bounties',
      '/api/scuttlebutt/messages',
      '/api/disassembly',
      '/api/sql/named',
      '/api/sql/receipt',
      '/api/ens',
      '/api/feed',
      '/api/foghorn/anything',
      '/api/cron/refresh',
    ]) {
      expect(isMigrated(path), `${path} must stay on Next`).toBe(false);
    }
  });

  /**
   * `/api/sql/query` moved. `/api/sql/catalog` moved and came back, its shape having never been
   * compared. `/api/sql/named` was never ported. Three routes under one prefix with three different
   * answers, which is why this is a list and not a `startsWith`.
   */
  it('splits the sql routes rather than taking the prefix', () => {
    expect(isMigrated('/api/sql/query')).toBe(true);
    expect(isMigrated('/api/sql/catalog')).toBe(false);
    expect(isMigrated('/api/sql/named')).toBe(false);
  });
});
