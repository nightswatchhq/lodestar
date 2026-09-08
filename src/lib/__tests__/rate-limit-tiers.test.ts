import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The bucketing, not the numbers.
 *
 * `/indexers` renders a sync dot per row, one request each - 87 on a full directory. With no tier of
 * its own that route landed in the catch-all and consumed the *shared* per-IP budget every other
 * route on the page draws from, so a reader doing nothing unusual was served 429s while the page was
 * still loading.
 *
 * Keys are `${ip}:${tier}`, so what actually fixes it is the separate tier. A test on the limit
 * numbers would just restate a constant; this asserts the isolation, which is the behaviour.
 */
describe('rate limit tiers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not let the per-row fan-out starve the rest of the API', async () => {
    const { rateLimit } = await import('../rate-limit');
    const ip = '203.0.113.1';

    // Enough to exhaust the *catch-all* budget, not merely a directory's worth. 150 was not: with
    // the tier removed those calls fall into the 400-wide catch-all, 150 never fills it, and the
    // assertion below passed with the fix deleted. Mutating the tier away is what caught that, and
    // it is the reason this number is 450 rather than a plausible-looking 87.
    for (let i = 0; i < 450; i++) {
      await rateLimit(ip, '/api/indexer-node-health');
    }

    // The same reader's next ordinary read must still be served.
    const other = await rateLimit(ip, '/api/network-stats');
    expect(
      other.allowed,
      'the sync-dot fan-out consumed the budget for every other route on the page',
    ).toBe(true);
  });

  it('still throttles one route hammered on its own', async () => {
    const { rateLimit } = await import('../rate-limit');
    const ip = '203.0.113.2';
    let refused = false;
    for (let i = 0; i < 500; i++) {
      const r = await rateLimit(ip, '/api/indexer-node-health');
      if (!r.allowed) { refused = true; break; }
    }
    expect(refused, 'a tier with its own bucket must still have a ceiling').toBe(true);
  });

  it('keeps the expensive routes tight', async () => {
    const { rateLimit } = await import('../rate-limit');
    const ip = '203.0.113.3';
    let refusedAt = 0;
    for (let i = 1; i <= 40; i++) {
      const r = await rateLimit(ip, '/api/sql/query');
      if (!r.allowed) { refusedAt = i; break; }
    }
    // Free-form SQL runs an analytical query against the Helsinki box; raising the catch-all must
    // not have loosened this one by accident.
    expect(refusedAt).toBeGreaterThan(0);
    expect(refusedAt).toBeLessThanOrEqual(10);
  });
});
