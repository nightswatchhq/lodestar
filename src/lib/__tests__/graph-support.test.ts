/**
 * The grouping rules, checked against the shapes the real repository actually has.
 *
 * Each case here is a thing the live labels do that `TRIAGE.md` does not mention: an issue with
 * two owners, an issue with two dispositions, four issues with no owner at all, open issues
 * carrying disposition labels, and labels in neither published list. Fixtures are trimmed from
 * the real issues so the numbers are not invented.
 */
import { describe, it, expect } from 'vitest';

import {
  areaCounts,
  areasOf,
  filterIssues,
  groupClosedByDisposition,
  groupOpenByOwner,
  isDisposition,
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

describe('owner grouping', () => {
  it('files a two-owner issue under the one further from the reader', () => {
    // #19 carries owner/edge-and-node and owner/reporter. "Edge & Node have to fix this" is the
    // more useful of the two, and filing it under both would double-count it.
    const i = issue({ number: 19, labels: ['owner/reporter', 'owner/edge-and-node'] });
    expect(primaryOwner(i)).toBe('owner/edge-and-node');
  });

  it('gives issues with no owner label a group of their own', () => {
    // Four of the live thirty-two have no owner/* label. Dropping them would be silent data loss.
    const groups = groupOpenByOwner([
      issue({ number: 29 }),
      issue({ number: 12 }),
      issue({ number: 31, labels: ['owner/indexer'] }),
    ]);
    const unowned = groups.find((g) => g.key === '');
    expect(unowned?.issues.map((i) => i.number).sort()).toEqual([12, 29]);
  });

  it('keeps an owner it has never heard of rather than dropping the issue', () => {
    // area/governance and kind/question are both live and in neither published list, so the
    // taxonomy demonstrably grows without this file being told.
    const groups = groupOpenByOwner([issue({ number: 40, labels: ['owner/some-new-party'] })]);
    expect(groups.map((g) => g.key)).toContain('owner/some-new-party');
    expect(groups.find((g) => g.key === 'owner/some-new-party')?.label).toBe('Some New Party');
  });

  it('assigns every open issue to exactly one group, so the counts add up', () => {
    const issues = [
      issue({ number: 1, labels: ['owner/edge-and-node', 'owner/reporter'] }),
      issue({ number: 2, labels: ['owner/indexer'] }),
      issue({ number: 3, labels: [] }),
      issue({ number: 4, labels: ['owner/brand-new'] }),
      issue({ number: 5, state: 'closed', labels: ['owner/indexer', 'fixed'] }),
    ];
    const groups = groupOpenByOwner(issues);
    const total = groups.reduce((n, g) => n + g.issues.length, 0);
    expect(total).toBe(4);
    const seen = groups.flatMap((g) => g.issues.map((i) => i.number));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('leaves closed issues out entirely', () => {
    const groups = groupOpenByOwner([issue({ number: 1, state: 'closed', labels: ['owner/watch'] })]);
    expect(groups).toEqual([]);
  });

  it('groups an open issue by owner even when it carries a disposition label', () => {
    // Six live open issues carry one, `handed-off` mostly, which is correct: the repo's rule is
    // that handed off is not closed. State must never be inferred from a label.
    const groups = groupOpenByOwner([
      issue({ number: 14, labels: ['owner/upstream', 'handed-off'] }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['owner/upstream']);
  });
});

describe('disposition grouping', () => {
  it('prefers fixed over root-cause-found when an issue carries both', () => {
    // #21 and #26 both do. Diagnosed and repaired is a better thing to tell a reader than
    // diagnosed, so the display order is deliberately not TRIAGE.md's order.
    const i = issue({ number: 21, state: 'closed', labels: ['root-cause-found', 'fixed'] });
    expect(primaryDisposition(i)).toBe('fixed');
  });

  it('surfaces a closed issue with no disposition instead of hiding it', () => {
    // Zero of these today, which is the process being kept. The group is the alarm for when it
    // is not, so it must exist even though it currently renders as nothing.
    const groups = groupClosedByDisposition([issue({ number: 99, state: 'closed' })]);
    expect(groups.map((g) => g.label)).toEqual(['Closed without a disposition']);
  });

  it('renders no group for a disposition nothing carries', () => {
    const groups = groupClosedByDisposition([
      issue({ number: 1, state: 'closed', labels: ['fixed'] }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['fixed']);
  });

  it('assigns every closed issue to exactly one group', () => {
    const issues = [
      issue({ number: 1, state: 'closed', labels: ['root-cause-found', 'fixed'] }),
      issue({ number: 2, state: 'closed', labels: ['handed-off'] }),
      issue({ number: 3, state: 'closed', labels: [] }),
      issue({ number: 4, labels: ['root-cause-found'] }),
    ];
    const total = groupClosedByDisposition(issues).reduce((n, g) => n + g.issues.length, 0);
    expect(total).toBe(3);
  });

  it('knows a disposition from a status label of the same idea', () => {
    expect(isDisposition('handed-off')).toBe(true);
    expect(isDisposition('status/handed-off')).toBe(false);
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

describe('ordering', () => {
  it('puts the most recently updated issue first within a group', () => {
    const groups = groupOpenByOwner([
      issue({ number: 1, labels: ['owner/indexer'], updatedAt: '2026-08-01T00:00:00Z' }),
      issue({ number: 2, labels: ['owner/indexer'], updatedAt: '2026-09-08T00:00:00Z' }),
    ]);
    expect(groups[0].issues.map((i) => i.number)).toEqual([2, 1]);
  });

  it('leads with the owners a reader cannot escalate to', () => {
    const groups = groupOpenByOwner([
      issue({ number: 1, labels: ['owner/reporter'] }),
      issue({ number: 2, labels: ['owner/edge-and-node'] }),
      issue({ number: 3, labels: ['owner/indexer'] }),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      'owner/edge-and-node',
      'owner/indexer',
      'owner/reporter',
    ]);
  });
});
