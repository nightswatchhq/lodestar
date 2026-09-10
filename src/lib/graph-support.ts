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

/**
 * What `/api/support` answers.
 *
 * Served by kittiwake's twice-daily mirror of the repository. `fetchedAt` is when that mirror last
 * ran, not when this request was made, so a page can say how old the archive is rather than how
 * recently it asked.
 */
export interface SupportArchive {
  issues: SupportIssue[];
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
 * Owner display names, in the order used to resolve an issue carrying more than one.
 *
 * Roughly furthest from the reader first: #19 is both `owner/edge-and-node` and `owner/reporter`,
 * and "Edge & Node have to fix this" is the more useful half. Shown as a badge on the row rather
 * than as a heading, because grouping by who owns a thing sorts the archive by organisation when
 * a reader is looking for a symptom.
 */
/**
 * The areas, in the order the page shows them, which follows the path a subgraph takes rather
 * than the alphabet or the issue count.
 *
 * Publish, index, serve, route, and the chain underneath all of it. A reader arrives with a
 * symptom and a rough idea of where in that path they are standing, which is a better first cut
 * than which organisation happens to own the fix. Fixed order, so landing an issue does not
 * reshuffle the page under someone reading it.
 */
const AREA_ORDER: readonly { key: string; label: string; blurb: string }[] = [
  {
    key: 'studio',
    label: 'Studio and publishing',
    blurb: 'Deploying, publishing and versioning, before anything is being served.',
  },
  {
    key: 'graph-node',
    label: 'graph-node and indexing',
    blurb: 'Handlers, determinism and the store: a subgraph that will not sync or has diverged.',
  },
  {
    key: 'indexer',
    label: 'Indexers',
    blurb: 'A specific operator’s node and what it is actually serving, healthy or otherwise.',
  },
  {
    key: 'gateway',
    label: 'Gateway and routing',
    blurb: 'How a query gets routed, and why yours reached the indexer it did or none at all.',
  },
  {
    key: 'rpc',
    label: 'RPC and chain data',
    blurb: 'The chain underneath, and the providers serving it. Frequently the real cause.',
  },
  {
    key: 'horizon',
    label: 'Horizon',
    blurb: 'Provisions, TAP and the new staking, where the upgrade behaves unlike the old one.',
  },
  {
    key: 'governance',
    label: 'Governance',
    blurb: 'Protocol decisions and parameters rather than code.',
  },
  {
    key: 'docs',
    label: 'Documentation',
    blurb: 'What the docs say, or do not.',
  },
];

const OWNER_ORDER: readonly { key: string; label: string; blurb: string }[] = [
  // The two core-team owners share one badge. Which of them owns a given fault is frequently not
  // knowable from outside, and naming one of them specifically asserts something the thread has
  // usually not established. `owner/*` still distinguishes them in the repository.
  {
    key: 'owner/edge-and-node',
    label: 'Edge & Node / The Graph Foundation',
    blurb: 'The core teams. Raised with them where there was somewhere to raise it.',
  },
  {
    key: 'owner/foundation',
    label: 'Edge & Node / The Graph Foundation',
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

/** `owner/edge-and-node` as `Edge & Node`, for the badge on a row. */
export function ownerLabel(key: string): string {
  return OWNER_ORDER.find((o) => o.key === key)?.label ?? prettifyOwner(key);
}

/** `root-cause-found` as `Root cause found`, for the badge on a row. */
export function dispositionLabel(key: string): string {
  return (
    DISPOSITION_ORDER.find((d) => d.key === key)?.label ??
    key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * Issues grouped by the part of the stack they are about.
 *
 * An issue appears under **every** area it carries, not one primary area. Nineteen of the
 * thirty-three carry more than one, and somebody whose gateway is misbehaving wants
 * `bad indexers: BadResponse(400)` in front of them whether or not it is also filed under
 * `area/indexer`. Picking a primary area would hide exactly the cross-cutting issues that are
 * hardest to find by searching.
 *
 * The consequence is that the group counts sum to more than the number of issues, which the page
 * says out loud rather than leaving a reader to add them up and wonder.
 */
export function groupByArea(issues: readonly SupportIssue[]): IssueGroup[] {
  const groups: IssueGroup[] = [];

  for (const { key, label, blurb } of AREA_ORDER) {
    const matched = issues.filter((i) => areasOf(i).includes(key)).sort(byRecency);
    if (matched.length > 0) groups.push({ key, label, blurb, issues: matched });
  }

  // Areas the taxonomy has gained since this file was written. `area/governance` arrived without
  // ever appearing in TRIAGE.md, so this path is not hypothetical.
  const known = new Set(AREA_ORDER.map((a) => a.key));
  const extra = new Set<string>();
  for (const issue of issues) {
    for (const area of areasOf(issue)) if (!known.has(area)) extra.add(area);
  }
  for (const key of [...extra].sort()) {
    groups.push({
      key,
      label: key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      issues: issues.filter((i) => areasOf(i).includes(key)).sort(byRecency),
    });
  }

  // An issue with no area label at all would otherwise be reachable only by search.
  const unfiled = issues.filter((i) => areasOf(i).length === 0).sort(byRecency);
  if (unfiled.length > 0) {
    groups.push({
      key: '',
      label: 'Not yet filed under an area',
      blurb: 'Open, and nobody has yet said which part of the stack these are about.',
      issues: unfiled,
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
