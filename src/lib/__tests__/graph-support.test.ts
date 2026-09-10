/**
 * The grouping rules, checked against the shapes the real repository actually has.
 *
 * Each case here is a thing the live labels do that `TRIAGE.md` does not mention: an issue with
 * two owners, an issue with two dispositions, four issues with no owner at all, open issues
 * carrying disposition labels, and labels in neither published list. Fixtures are trimmed from
 * the real issues so the numbers are not invented.
 */
import { describe, it, expect } from 'vitest';

import snapshot from '@/data/graph-support.json';
import {
  areaCounts,
  areasOf,
  dispositionLabel,
  filterIssues,
  groupByArea,
  isDisposition,
  ownerLabel,
  primaryDisposition,
  primaryOwner,
  type SupportIssue,
} from '../graph-support';

function issue(overrides: Partial<SupportIssue> & Pick<SupportIssue, 'number'>): SupportIssue {
  return {
    title: `issue ${overrides.number}`,
    url: `https://github.com/nightswatchhq/graph-support/issues/${overrides.number}`,
    state: 'open',
    labels: [],
    comments: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('grouping by area', () => {
  it('lists an issue under every area it carries, not one primary area', () => {
    // Nineteen of the live thirty-three carry more than one. Somebody whose gateway is misbehaving
    // wants this issue even though it is also an indexer problem.
    const groups = groupByArea([
      issue({ number: 31, labels: ['area/gateway', 'area/indexer', 'area/horizon'] }),
    ]);
    expect(groups.map((g) => g.key).sort()).toEqual(['gateway', 'horizon', 'indexer']);
    for (const g of groups) expect(g.issues.map((i) => i.number)).toEqual([31]);
  });

  it('follows the path a subgraph takes rather than the alphabet or the count', () => {
    const groups = groupByArea([
      issue({ number: 1, labels: ['area/rpc'] }),
      issue({ number: 2, labels: ['area/studio'] }),
      issue({ number: 3, labels: ['area/gateway'] }),
      issue({ number: 4, labels: ['area/graph-node'] }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['studio', 'graph-node', 'gateway', 'rpc']);
  });

  it('does not reorder when one area outgrows another', () => {
    // Ordering by count would reshuffle the page under whoever is reading it.
    const many = Array.from({ length: 9 }, (_, n) => issue({ number: n + 10, labels: ['area/rpc'] }));
    const groups = groupByArea([issue({ number: 1, labels: ['area/studio'] }), ...many]);
    expect(groups.map((g) => g.key)).toEqual(['studio', 'rpc']);
  });

  it('keeps an area it has never heard of rather than dropping the issue', () => {
    // area/governance arrived without ever appearing in TRIAGE.md, so this is not hypothetical.
    const groups = groupByArea([issue({ number: 40, labels: ['area/some-new-layer'] })]);
    expect(groups.map((g) => g.key)).toContain('some-new-layer');
    expect(groups.find((g) => g.key === 'some-new-layer')?.label).toBe('Some new layer');
  });

  it('gives an issue with no area label a group of its own', () => {
    const groups = groupByArea([issue({ number: 29 }), issue({ number: 1, labels: ['area/rpc'] })]);
    const unfiled = groups.find((g) => g.key === '');
    expect(unfiled?.issues.map((i) => i.number)).toEqual([29]);
  });

  it('loses no issue: every one appears at least once', () => {
    const issues = [
      issue({ number: 1, labels: ['area/gateway', 'area/indexer'] }),
      issue({ number: 2, labels: ['area/some-new-layer'] }),
      issue({ number: 3, labels: [] }),
      issue({ number: 4, labels: ['area/studio'] }),
    ];
    const seen = new Set(groupByArea(issues).flatMap((g) => g.issues.map((i) => i.number)));
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('renders no group for an area nothing carries', () => {
    const groups = groupByArea([issue({ number: 1, labels: ['area/docs'] })]);
    expect(groups.map((g) => g.key)).toEqual(['docs']);
  });

  it('puts the most recently updated issue first within an area', () => {
    const groups = groupByArea([
      issue({ number: 1, labels: ['area/rpc'], updatedAt: '2026-08-01T00:00:00Z' }),
      issue({ number: 2, labels: ['area/rpc'], updatedAt: '2026-09-08T00:00:00Z' }),
    ]);
    expect(groups[0].issues.map((i) => i.number)).toEqual([2, 1]);
  });
});

describe('the owner badge', () => {
  it('picks the owner further from the reader when an issue carries two', () => {
    // #19 carries owner/edge-and-node and owner/reporter. "Edge & Node have to fix this" is the
    // more useful half, and the badge has room for one.
    const i = issue({ number: 19, labels: ['owner/reporter', 'owner/edge-and-node'] });
    expect(primaryOwner(i)).toBe('owner/edge-and-node');
    expect(ownerLabel(primaryOwner(i)!)).toBe('Edge & Node');
  });

  it('is absent rather than wrong when nothing says who owns it', () => {
    // Four of the live thirty-three have no owner/* label at all.
    expect(primaryOwner(issue({ number: 29, labels: ['area/graph-node'] }))).toBeNull();
  });

  it('names an owner it has never heard of rather than showing the raw label', () => {
    expect(ownerLabel('owner/some-new-party')).toBe('Some New Party');
  });
});

describe('the disposition badge', () => {
  it('prefers fixed over root-cause-found when an issue carries both', () => {
    // #21 and #26 both do. Diagnosed and repaired is a better thing to tell a reader than
    // diagnosed, so the precedence is deliberately not TRIAGE.md's order.
    const i = issue({ number: 21, state: 'closed', labels: ['root-cause-found', 'fixed'] });
    expect(primaryDisposition(i)).toBe('fixed');
    expect(dispositionLabel('fixed')).toBe('Fixed');
  });

  it('is absent on an issue closed without one, rather than invented', () => {
    // Zero of these today, which is the process being kept.
    expect(primaryDisposition(issue({ number: 99, state: 'closed' }))).toBeNull();
  });

  it('knows a disposition from a status label of the same idea', () => {
    expect(isDisposition('handed-off')).toBe(true);
    expect(isDisposition('status/handed-off')).toBe(false);
  });

  it('does not read state from a label: open issues carry dispositions too', () => {
    // Six live open issues do, `handed-off` mostly, which is correct by the repo's own rule that
    // handed off is not closed.
    const i = issue({ number: 14, labels: ['owner/upstream', 'handed-off'] });
    expect(i.state).toBe('open');
    expect(primaryDisposition(i)).toBe('handed-off');
  });
});

describe('search', () => {
  it('matches the literal error text a stranger would paste', () => {
    const issues = [
      issue({ number: 31, title: 'bad indexers: {0x3b9ba748...: BadResponse(400)} on QmWP5gEwn' }),
      issue({ number: 16, title: 'Scroll Sepolia network disappeared' }),
    ];
    expect(filterIssues(issues, 'badresponse(400)').map((i) => i.number)).toEqual([31]);
  });

  it('matches an issue number, with or without the hash', () => {
    const issues = [
      issue({ number: 16, title: 'Scroll Sepolia network disappeared' }),
      issue({ number: 160, title: 'something else entirely' }),
    ];
    expect(filterIssues(issues, '#16').map((i) => i.number)).toEqual([16]);
    expect(filterIssues(issues, '16').map((i) => i.number)).toEqual([16]);
  });

  it('matches a number appearing in a title as well as the issue number itself', () => {
    // Deliberate. `400` should find the BadResponse(400) thread, not only issue #400.
    const issues = [
      issue({ number: 31, title: 'bad indexers: BadResponse(400) on every allocated indexer' }),
      issue({ number: 400, title: 'unrelated' }),
    ];
    expect(filterIssues(issues, '400').map((i) => i.number).sort()).toEqual([31, 400]);
  });

  it('returns everything for an empty or whitespace query', () => {
    const issues = [issue({ number: 1 }), issue({ number: 2 })];
    expect(filterIssues(issues, '')).toHaveLength(2);
    expect(filterIssues(issues, '   ')).toHaveLength(2);
  });
});

describe('areas', () => {
  it('strips the prefix and keeps multiple areas per issue', () => {
    // Fifty-four area labels across thirty-two issues, so more than one is the normal case.
    expect(areasOf(issue({ number: 1, labels: ['area/gateway', 'area/indexer', 'seed'] }))).toEqual([
      'gateway',
      'indexer',
    ]);
  });

  it('counts areas commonest first, breaking ties alphabetically', () => {
    const issues = [
      issue({ number: 1, labels: ['area/indexer', 'area/gateway'] }),
      issue({ number: 2, labels: ['area/indexer'] }),
      issue({ number: 3, labels: ['area/studio'] }),
    ];
    expect(areaCounts(issues)).toEqual([
      { area: 'indexer', count: 2 },
      { area: 'gateway', count: 1 },
      { area: 'studio', count: 1 },
    ]);
  });
});

describe('the committed snapshot', () => {
  // src/data/graph-support.json is what /support serves when GitHub cannot be read, so a broken
  // regeneration must fail here rather than reach a phone as an empty page. Refresh it with
  // `pnpm support:snapshot`.
  const issues = snapshot.issues as SupportIssue[];

  it('holds the archive rather than an empty list', () => {
    expect(issues.length).toBeGreaterThan(20);
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('has every field the page reads, on every issue', () => {
    for (const i of issues) {
      expect(typeof i.number, `#${i.number}`).toBe('number');
      expect(i.title.length, `#${i.number} title`).toBeGreaterThan(0);
      expect(i.url).toContain('github.com/nightswatchhq/graph-support/issues/');
      expect(['open', 'closed']).toContain(i.state);
      expect(Array.isArray(i.labels)).toBe(true);
      expect(Number.isFinite(new Date(i.updatedAt).getTime()), `#${i.number} updatedAt`).toBe(true);
    }
  });

  it('carries no pull requests, which the issues endpoint also returns', () => {
    expect(issues.every((i) => i.url.includes('/issues/'))).toBe(true);
  });

  it('groups without losing an issue', () => {
    // The real labels, not fixtures: multi-area, multi-owner and multi-disposition are all here.
    const seen = new Set(groupByArea(issues).flatMap((g) => g.issues.map((i) => i.number)));
    expect(seen.size).toBe(issues.length);
  });

  it('files every issue under at least one area, so none is search-only', () => {
    const unfiled = issues.filter((i) => areasOf(i).length === 0).map((i) => i.number);
    expect(unfiled, 'issues with no area/* label').toEqual([]);
  });

  it('lists more rows than issues, because issues span areas', () => {
    // The page states this rather than leaving a reader to add the headings up and wonder.
    const rows = groupByArea(issues).reduce((n, g) => n + g.issues.length, 0);
    expect(rows).toBeGreaterThan(issues.length);
  });

  it('has labels outside the ones TRIAGE.md publishes, which is why nothing rejects them', () => {
    const all = new Set(issues.flatMap((i) => i.labels));
    expect(all.has('area/governance') || all.has('kind/question')).toBe(true);
  });
});
