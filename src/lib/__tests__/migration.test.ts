/**
 * The check that stops the migration panel becoming a story about itself.
 *
 * A progress figure nobody verifies drifts in exactly one direction. The defect behind
 * nightswatchhq/kittiwake#23 was two lists that had to agree with nothing enforcing it, so three
 * routes moved to production uncompared. These tests walk the filesystem and refuse to let the
 * inventory disagree with what is actually on disk, in either direction.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  MIGRATED,
  isMigrated,
  buildInventory,
  summarise,
  type RouteRecord,
} from '../migration';
import { ROUTE_FILES } from '../route-files.generated';

const API_DIR = join(process.cwd(), 'src', 'app', 'api');

/** Every `route.ts` under src/app/api, as the URL path it serves. */
function routeFilePaths(dir = API_DIR, prefix = '/api'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...routeFilePaths(full, `${prefix}/${entry}`));
    } else if (entry === 'route.ts') {
      out.push(prefix);
    }
  }
  return out;
}

const onDisk = routeFilePaths();
const inventory = buildInventory(onDisk);
const byPath = new Map(inventory.map((r) => [r.path, r]));

describe('the route inventory', () => {
  // The committed list is what ships; the walk is what checks it. If these drift, the panel
  // reports a figure computed from a repo that no longer exists. Regenerate with
  // `pnpm migration:routes`.
  it('has a committed route list that matches the filesystem exactly', () => {
    expect([...ROUTE_FILES].sort()).toEqual([...onDisk].sort());
  });

  it('finds the API routes at all, so an empty walk cannot pass as agreement', () => {
    // Absent data rendering as healthy is the failure this whole file exists to prevent. A broken
    // path here would make every other assertion below vacuously true.
    expect(onDisk.length).toBeGreaterThan(50);
    expect(onDisk).toContain('/api/network-stats');
  });

  it('covers every route file on disk', () => {
    const missing = onDisk.filter((p) => !byPath.has(p));
    expect(missing, 'route files with no line in src/lib/migration.ts').toEqual([]);
  });

  it('claims no route that does not exist', () => {
    // Backend-only routes are the deliberate exception and are declared as such.
    const backendOnly = inventory.filter((r) => !onDisk.includes(r.path)).map((r) => r.path);
    expect(backendOnly).toEqual(['/api/whoami']);
  });

  it('agrees with the proxy about which routes the edge sends to kittiwake', () => {
    // The two directions are asserted separately because they fail for different reasons: a route
    // marked done that the edge does not forward is a false claim of progress, and a route the
    // edge forwards that the inventory has not marked is an uncounted win.
    const claimedDone = inventory.filter((r) => r.state === 'kittiwake').map((r) => r.path);
    const notActuallyForwarded = claimedDone.filter((p) => !isMigrated(p));
    expect(notActuallyForwarded, 'marked migrated but the edge still serves them from Next').toEqual([]);

    const forwardedButUnmarked = onDisk.filter(
      (p) => isMigrated(p) && byPath.get(p)!.state !== 'kittiwake',
    );
    expect(forwardedButUnmarked, 'the edge forwards these but the inventory does not count them').toEqual([]);
  });

  it('has no duplicate entries', () => {
    const paths = inventory.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every route staying on Next a reason', () => {
    for (const r of inventory.filter((x) => x.state === 'staying')) {
      expect(r.note, `${r.path} stays on Next without saying why`).toBeTruthy();
      expect(r.note!.length).toBeGreaterThan(20);
    }
  });

  it('gives every doomed route a reason, so deletion is a decision and not a shrug', () => {
    for (const r of inventory.filter((x) => x.state === 'doomed')) {
      expect(r.note, `${r.path} is marked for deletion without saying why`).toBeTruthy();
    }
  });
});

describe('isMigrated', () => {
  it('does not let a prefix swallow a sibling', () => {
    expect(isMigrated('/api/indexers')).toBe(true);
    // `/api/indexers-enriched` is separately listed; the point is that it matches on its own
    // entry rather than by being a prefix of `/api/indexers`.
    expect(MIGRATED).toContain('/api/indexers');
    expect(MIGRATED).not.toContain('/api/indexers/');
    expect(isMigrated('/api/indexers-and-something-invented')).toBe(false);
  });

  it('treats a trailing slash as exactly one more segment, not everything below', () => {
    expect(isMigrated('/api/indexer/0xabc')).toBe(true);
    // The three faults this rule fixes. All were live: the first two answered 404 from a backend
    // with no handler, the third was parsed as an address and answered 400.
    expect(isMigrated('/api/indexer/0xabc/pnl')).toBe(false);
    expect(isMigrated('/api/indexer/0xabc/revenue')).toBe(false);
    expect(isMigrated('/api/indexer/present-poi')).toBe(false);
  });

  it('does not forward a bare prefix with nothing after it', () => {
    expect(isMigrated('/api/indexer/')).toBe(false);
    expect(isMigrated('/api/subgraph-history/')).toBe(false);
  });

  it('leaves an unlisted route alone', () => {
    expect(isMigrated('/api/studio/auth')).toBe(false);
    expect(isMigrated('/api/scuttlebutt/stream')).toBe(false);
  });
});

describe('summarise', () => {
  const summary = summarise(inventory);

  it('excludes crons and deletions from the denominator', () => {
    // A percentage is only honest if the denominator is. Counting six routes we have agreed to
    // delete as outstanding work would understate progress; counting them as done would overstate
    // it. They are reported on their own line instead.
    expect(summary.inScope).toBe(summary.onKittiwake + summary.onNext);
    expect(summary.doomed).toBeGreaterThan(0);
    expect(summary.scheduled).toBeGreaterThan(0);
  });

  it('reports a percentage consistent with its own counts', () => {
    expect(summary.percent).toBe(Math.round((summary.onKittiwake / summary.inScope) * 100));
    expect(summary.percent).toBeGreaterThan(0);
    expect(summary.percent).toBeLessThan(100);
  });

  it('accounts for every in-scope route exactly once across the workstreams', () => {
    const total = summary.byWorkstream.reduce((n, w) => n + w.total, 0);
    expect(total).toBe(summary.inScope);
  });

  it('counts routes that are staying separately from routes that are done', () => {
    expect(summary.stayingOnNext).toBeGreaterThan(0);
    const staying = inventory.filter((r) => r.state === 'staying' && r.workstream !== 'scheduled');
    expect(summary.stayingOnNext).toBe(staying.length);
  });
});

describe('summarise, on a fixture rather than the live tree', () => {
  // Pinned arithmetic, so a change to the real inventory cannot quietly change what the numbers
  // mean as well as what they are.
  const fixture: RouteRecord[] = [
    { path: '/api/a', state: 'kittiwake', workstream: 'data plane' },
    { path: '/api/b', state: 'kittiwake', workstream: 'data plane' },
    { path: '/api/c', state: 'kittiwake', workstream: 'data plane' },
    { path: '/api/d', state: 'next', workstream: 'the long tail' },
    { path: '/api/e', state: 'staying', workstream: 'data plane', note: 'a reason long enough to pass' },
    { path: '/api/f', state: 'doomed', workstream: 'deletions', note: 'gone' },
    { path: '/api/cron/g', state: 'cron', workstream: 'scheduled' },
  ];

  it('is three of four, not three of seven', () => {
    const s = summarise(fixture);
    expect(s.onKittiwake).toBe(3);
    expect(s.onNext).toBe(1);
    expect(s.inScope).toBe(4);
    expect(s.percent).toBe(75);
    expect(s.stayingOnNext).toBe(1);
    expect(s.doomed).toBe(1);
    expect(s.scheduled).toBe(1);
  });
});
