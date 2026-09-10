/**
 * The six issue templates in nightswatchhq/graph-support, as a chooser.
 *
 * Filing goes to GitHub's own form rather than being composed here and posted with a token. Two
 * reasons, and the second is the one that decides it. A server-side token would put back exactly
 * the credential this page just removed, and it would make every report arrive from one bot
 * account: that repository credits reporters by name and replies to them in the thread, and an
 * archive where every issue was opened by `lodestar-bot` cannot do either.
 *
 * So what Lodestar contributes is the part a reporter actually finds hard, which is knowing which
 * of the six to pick, and GitHub renders the form it already maintains. The one thing that can
 * drift is a renamed file; GitHub falls back to its own chooser when `template` names nothing,
 * which is a soft landing rather than a 404.
 */

const REPO = 'https://github.com/nightswatchhq/graph-support';

export interface IssueTemplate {
  /** The filename, which is what GitHub's `template` parameter takes. */
  file: string;
  name: string;
  description: string;
  /** What the thread gets labelled on arrival, for the reader to see before they commit to one. */
  labels: readonly string[];
}

export const ISSUE_TEMPLATES: readonly IssueTemplate[] = [
  {
    file: '01-query-error.yml',
    name: 'A query fails or returns wrong data',
    description:
      'A query against a subgraph errors, returns nothing, or returns data you know is wrong or stale.',
    labels: ['status/triage'],
  },
  {
    file: '02-subgraph.yml',
    name: 'A subgraph will not deploy, sync, or has failed',
    description:
      'Deployment errors, a subgraph stuck syncing, stuck at 99%, or a failed deployment.',
    labels: ['status/triage'],
  },
  {
    file: '03-indexer.yml',
    name: 'An indexer or operator problem',
    description:
      'For people running indexers. Chain clients, RPC, snapshots, PoI divergence, allocations, Horizon, staking.',
    labels: ['status/triage', 'area/indexer'],
  },
  {
    file: '04-docs.yml',
    name: 'The documentation is wrong or unclear',
    description:
      'Something in the official docs is incorrect, ambiguous, or led you into a mistake.',
    labels: ['status/triage', 'area/docs', 'owner/upstream'],
  },
  {
    file: '05-question.yml',
    name: 'A question',
    description:
      'Not obviously broken, you just want to know how something works or what the right approach is.',
    labels: ['status/triage', 'kind/question'],
  },
  {
    file: '06-symptom.yml',
    name: 'A symptom the diagnostic index does not cover',
    description:
      'Something broke in a way the Academy’s symptom index does not carry, and the next person should not have to work it out again.',
    labels: ['status/triage', 'kind/symptom'],
  },
];

/**
 * A link into GitHub's form for one template.
 *
 * `title` seeds the subject, which is worth doing when the reporter has already typed the error
 * into the search box and found nothing: that string is usually the best title the thread will
 * ever get, and that repository asks for the literal error text in the title on purpose.
 */
export function newIssueUrl(template: IssueTemplate, title?: string): string {
  const params = new URLSearchParams({ template: template.file });
  const seed = title?.trim();
  if (seed) params.set('title', seed);
  return `${REPO}/issues/new?${params.toString()}`;
}

/** GitHub's own chooser, for anyone whose problem fits none of the six. */
export const CHOOSER_URL = `${REPO}/issues/new/choose`;
