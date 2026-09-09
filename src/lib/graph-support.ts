/**
 * The graph-support archive, as this dashboard reads it.
 *
 * nightswatchhq/graph-support closes issues with a root cause and a worked case attached, and
 * until now the only way to find one was to already think of searching GitHub. The grouping here
 * is the repo's own label taxonomy (its `TRIAGE.md`): `area/*` for what broke, `owner/*` for who
 * can actually fix it, and a disposition label set on close.
 *
 * Three things about the real labels that the taxonomy document does not tell you, each of which
 * decides a function below:
 *
 *   - It is not exhaustive. `area/governance` and `kind/question` are both in use and in neither
 *     list, so nothing here rejects a label it does not recognise; unknown owners get a
 *     prettified name and unknown areas pass through.
 *   - Four of thirty-two issues carry no `owner/*` label at all. They get their own group rather
 *     than being dropped, because an issue that vanishes from the page is worse than an issue
 *     filed under "not yet triaged".
 *   - Six open issues carry a disposition label, `handed-off` mostly, which is correct by the
 *     repo's own rule that handed off is not closed. So state comes from the issue state and
 *     never from the labels.
 */

/** One issue, reduced to what the page renders. */
export interface SupportIssue {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed';
  labels: readonly string[];
  comments: number;
  createdAt: string;
  updatedAt: string;
}

/** What `/api/support` answers. `error` and `issues` are mutually exclusive by construction. */
export interface SupportArchive {
  issues: SupportIssue[];
  /** When the underlying fetch ran, so the page can say how fresh the cached copy is. */
  fetchedAt: string;
}

/** A rendered group: issues that share an owner, or share a disposition. */
export interface IssueGroup {
  /** The label name, or `''` for the group of issues carrying none of them. */
  key: string;
  label: string;
  /** One line on what the group means for a reader, or undefined where the label speaks. */
  blurb?: string;
  issues: SupportIssue[];
}

const OWNER_PREFIX = 'owner/';
const AREA_PREFIX = 'area/';

/**
 * Owners in the order the page shows them, which is roughly furthest from the reader first.
 *
 * A reader's first question is whether their problem is someone else's to fix, so the parties
 * they cannot escalate to lead. Fixed order rather than by count, so landing an issue does not
 * reshuffle the page under anyone reading it.
 */
const OWNER_ORDER: readonly { key: string; label: string; blurb: string }[] = [
  {
    key: 'owner/edge-and-node',
    label: 'Edge & Node',
    blurb: 'Only Edge & Node can fix these. Raised with them where there was somewhere to raise it.',
  },
  {
    key: 'owner/foundation',
    label: 'The Graph Foundation',
    blurb: 'Governance, funding or protocol-parameter decisions rather than code.',
  },
  {
    key: 'owner/upstream',
    label: 'Upstream projects',
    blurb: 'A chain client, an RPC provider or another dependency outside The Graph entirely.',
  },
  {
    key: 'owner/indexer',
    label: 'Indexers',
    blurb: 'Fixable by the operator of a specific indexer, once they know which one and why.',
  },
  {
    key: 'owner/watch',
    label: "The Night's Watch",
    blurb: 'Ours. If one of these is stuck, saying so in the thread is the fastest way to move it.',
  },
  {
    key: 'owner/reporter',
    label: 'The reporter',
    blurb: 'Something in the reporter’s own stack, which is often the good news.',
  },
];

/**
 * Dispositions in the order the page shows them, which is also the order a multi-labelled issue
 * resolves in.
 *
 * Deliberately not `TRIAGE.md`'s order: two issues carry `root-cause-found` and `fixed` together,
 * and of the two, fixed is the outcome a reader wants to see. Diagnosed and repaired beats
 * diagnosed.
 */
const DISPOSITION_ORDER: readonly { key: string; label: string; blurb: string }[] = [
  {
    key: 'fixed',
    label: 'Fixed',
    blurb: 'The fault is gone, not merely understood.',
  },
  {
    key: 'root-cause-found',
    label: 'Root cause found',
    blurb: 'The mechanism is written up, with the check that distinguishes it. The archive proper.',
  },
  {
    key: 'handed-off',
    label: 'Handed off',
    blurb: 'Belongs to someone else, and the thread records where and when it was raised.',
  },
  {
    key: 'cannot-reproduce',
    label: 'Could not reproduce',
    blurb: 'Worth reading anyway for what was ruled out.',
  },
  {
    key: 'out-of-scope',
    label: 'Out of scope',
    blurb: 'Closed honestly rather than left open forever.',
  },
];

/** Every disposition label, for telling one apart from an area or a status. */
const DISPOSITIONS: ReadonlySet<string> = new Set(DISPOSITION_ORDER.map((d) => d.key));

/** `owner/edge-and-node` as `Edge & Node`, for an owner the list above has not heard of. */
function prettifyOwner(label: string): string {
  return label
    .slice(OWNER_PREFIX.length)
    .split('-')
    .map((word) => (word === 'and' ? '&' : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

/** The `area/*` labels on an issue, prefix stripped, in the order GitHub returned them. */
export function areasOf(issue: SupportIssue): string[] {
  return issue.labels
    .filter((l) => l.startsWith(AREA_PREFIX))
    .map((l) => l.slice(AREA_PREFIX.length));
}

/**
 * The one owner an issue is filed under.
 *
 * #19 carries both `owner/edge-and-node` and `owner/reporter`, so this picks by the display order
 * rather than by whatever order GitHub happens to return labels in. An issue appears in exactly
 * one group, which is what lets the group counts add up to the total.
 */
export function primaryOwner(issue: SupportIssue): string | null {
  for (const { key } of OWNER_ORDER) {
    if (issue.labels.includes(key)) return key;
  }
  // An owner the taxonomy has gained since this file was written still counts as owned.
  return issue.labels.find((l) => l.startsWith(OWNER_PREFIX)) ?? null;
}

/** The one disposition an issue is filed under, by the order above. */
export function primaryDisposition(issue: SupportIssue): string | null {
  for (const { key } of DISPOSITION_ORDER) {
    if (issue.labels.includes(key)) return key;
  }
  return null;
}

/** Newest activity first, which is the only ordering that needs no explaining. */
function byRecency(a: SupportIssue, b: SupportIssue): number {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/**
 * Open issues grouped by who can fix them.
 *
 * Empty groups are dropped, so a page rendering four headings is telling you there are only four
 * kinds of open problem rather than hiding the rest.
 */
export function groupOpenByOwner(issues: readonly SupportIssue[]): IssueGroup[] {
  const open = issues.filter((i) => i.state === 'open');
  const groups: IssueGroup[] = [];

  for (const { key, label, blurb } of OWNER_ORDER) {
    const matched = open.filter((i) => primaryOwner(i) === key).sort(byRecency);
    if (matched.length > 0) groups.push({ key, label, blurb, issues: matched });
  }

  // Owners gained since OWNER_ORDER was written, so a new label shows up rather than disappearing.
  const known = new Set(OWNER_ORDER.map((o) => o.key));
  const extra = new Map<string, SupportIssue[]>();
  for (const issue of open) {
    const owner = primaryOwner(issue);
    if (owner && !known.has(owner)) {
      const list = extra.get(owner) ?? [];
      list.push(issue);
      extra.set(owner, list);
    }
  }
  for (const [key, list] of [...extra].sort(([a], [b]) => a.localeCompare(b))) {
    groups.push({ key, label: prettifyOwner(key), issues: list.sort(byRecency) });
  }

  const unowned = open.filter((i) => primaryOwner(i) === null).sort(byRecency);
  if (unowned.length > 0) {
    groups.push({
      key: '',
      label: 'Not yet assigned an owner',
      blurb: 'Open, and nobody has yet said whose these are.',
      issues: unowned,
    });
  }

  return groups;
}

/** Closed issues grouped by how they ended. */
export function groupClosedByDisposition(issues: readonly SupportIssue[]): IssueGroup[] {
  const closed = issues.filter((i) => i.state === 'closed');
  const groups: IssueGroup[] = [];

  for (const { key, label, blurb } of DISPOSITION_ORDER) {
    const matched = closed.filter((i) => primaryDisposition(i) === key).sort(byRecency);
    if (matched.length > 0) groups.push({ key, label, blurb, issues: matched });
  }

  // The repo's own rule is that no issue closes silently. This group is that rule's alarm, and it
  // renders as nothing at all while the rule is being kept.
  const silent = closed.filter((i) => primaryDisposition(i) === null).sort(byRecency);
  if (silent.length > 0) {
    groups.push({
      key: '',
      label: 'Closed without a disposition',
      blurb: 'Which the triage process says should not happen.',
      issues: silent,
    });
  }

  return groups;
}

/**
 * Search over titles and issue numbers.
 *
 * Titles only, on purpose: that repo puts the literal error text in the title precisely so a
 * stranger pasting `BadResponse(400)` finds the thread. Widening this to bodies would bury that
 * behind whichever issue happens to quote the most logs.
 */
export function filterIssues(issues: readonly SupportIssue[], query: string): SupportIssue[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...issues];
  const asNumber = q.replace(/^#/, '');
  return issues.filter(
    (i) => i.title.toLowerCase().includes(q) || String(i.number) === asNumber,
  );
}

/** Every area label in use, with how many issues carry it, commonest first. */
export function areaCounts(issues: readonly SupportIssue[]): { area: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    for (const area of areasOf(issue)) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts]
    .map(([area, count]) => ({ area, count }))
    .sort((a, b) => b.count - a.count || a.area.localeCompare(b.area));
}

/** True when a label is a disposition rather than an area, owner or status. */
export function isDisposition(label: string): boolean {
  return DISPOSITIONS.has(label);
}
