import { describe, it, expect } from 'vitest';
import { rateLimit } from '../rate-limit';

// Each test uses a UNIQUE ip so the process-local counter doesn't bleed across cases.
let ipCounter = 0;
const freshIp = () => `10.0.0.${++ipCounter % 250}.${Date.now() % 1000}`;

describe('rateLimit — tier limits', () => {
  it.each([
    ['/api/feed', 20],
    ['/api/sql/query', 5],
    ['/api/cron/tap-provision', 20],
    ['/api/portfolio', 30],
    ['/api/scuttlebutt/messages', 60],
    ['/api/indexer-status/0xabc', 20],
    ['/api/epochs', 400], // fallback - raised from 200 for the per-row fan-out on /indexers
  ])('reports the right limit for %s', async (path, limit) => {
    const r = await rateLimit(freshIp(), path);
    expect(r.limit).toBe(limit);
    expect(r.allowed).toBe(true);
  });

  // Pinned rather than merely configured. Public SQL is the one tier where the limit is a spending
  // decision about the Helsinki box rather than a tuning preference, and a number that drifts back
  // up during a refactor would do so silently and cost real CPU on a host running the Oracle,
  // dips-nest and the data-service gateway. Raise these deliberately or not at all.
  it.each([
    ['/api/sql/query', 5],
    ['/api/sql/named', 15],
    ['/api/sql/catalog', 30],
  ])('holds the public SQL limit for %s', async (path, limit) => {
    const r = await rateLimit(freshIp(), path);
    expect(r.limit).toBe(limit);
  });

  it('rations the query surface more tightly than the schema surface', async () => {
    const q = await rateLimit(freshIp(), '/api/sql/query');
    const c = await rateLimit(freshIp(), '/api/sql/catalog');
    expect(q.limit).toBeLessThan(c.limit);
  });

  // The ordering is the product statement: a declared, pinned question has a cost we chose in
  // advance, an arbitrary SELECT has one a stranger explores for free.
  it('gives a declared question a better allowance than an arbitrary one', async () => {
    const named = await rateLimit(freshIp(), '/api/sql/named');
    const free = await rateLimit(freshIp(), '/api/sql/query');
    expect(named.limit).toBeGreaterThan(free.limit);
  });
});

describe('rateLimit — enforcement', () => {
  it('allows up to the limit then blocks (429) within the window', async () => {
    const ip = freshIp();
    // The budget is read from the first call rather than typed in, so changing the number in
    // `rate-limit.ts` cannot leave this test quietly asserting the old one.
    const first = await rateLimit(ip, '/api/file-issue');
    expect(first.allowed).toBe(true);
    for (let i = 1; i < first.limit; i++) {
      const r = await rateLimit(ip, '/api/file-issue');
      expect(r.allowed, `request ${i + 1} should pass`).toBe(true);
    }
    const blocked = await rateLimit(ip, '/api/file-issue');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('decrements remaining on each hit', async () => {
    const ip = freshIp();
    const r1 = await rateLimit(ip, '/api/scuttlebutt/messages'); // 60
    const r2 = await rateLimit(ip, '/api/scuttlebutt/messages');
    expect(r1.remaining).toBe(59);
    expect(r2.remaining).toBe(58);
  });

  it('isolates counters per IP', async () => {
    const a = freshIp();
    const b = freshIp();
    const cap = (await rateLimit(a, '/api/file-issue')).limit;
    for (let i = 1; i < cap; i++) await rateLimit(a, '/api/file-issue');
    const aBlocked = await rateLimit(a, '/api/file-issue');
    const bOk = await rateLimit(b, '/api/file-issue');
    expect(aBlocked.allowed).toBe(false);
    expect(bOk.allowed).toBe(true);
  });

  it('isolates counters per tier (different paths do not share a bucket)', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await rateLimit(ip, '/api/file-issue'); // exhaust 10
    const chatBlocked = await rateLimit(ip, '/api/file-issue');
    const feedOk = await rateLimit(ip, '/api/feed'); // separate tier
    expect(chatBlocked.allowed).toBe(false);
    expect(feedOk.allowed).toBe(true);
  });
});
