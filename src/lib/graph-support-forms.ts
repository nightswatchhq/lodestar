/**
 * The six issue forms, read from kittiwake's mirror of the repository that declares them.
 *
 * Shared by the route that serves them to the compose page and the route that files with them, so
 * the form a reporter fills in is the same parse the filing is validated against rather than two
 * that can disagree.
 */

import { cached } from '@/lib/cache';
import { log } from '@/lib/logger';
import { parseIssueForm, type IssueForm } from '@/lib/issue-form';

export const REPO = 'nightswatchhq/graph-support';
export const CHOOSER_URL = `https://github.com/${REPO}/issues/new/choose`;

/**
 * A fine-grained token with issues:write on that repository and nothing else.
 *
 * Named apart from the `GITHUB_TOKEN` this codebase used to carry for reads, so a token granted
 * for one purpose cannot be silently spent on the other. Read through a function because the
 * routes are module-loaded once and the env is not.
 */
export function issueToken(): string | undefined {
  return process.env.GRAPH_SUPPORT_ISSUE_TOKEN || undefined;
}

const TEMPLATE_TTL_SECONDS = 900;

interface MirroredTemplate {
  file: string;
  yaml: string;
}

function apiOrigin(): string | undefined {
  return process.env.LODESTAR_API_ORIGIN?.replace(/\/+$/, '');
}

async function fromMirror(): Promise<MirroredTemplate[] | null> {
  const origin = apiOrigin();
  if (!origin) return null;
  try {
    const res = await fetch(`${origin}/api/support/templates`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { templates?: MirroredTemplate[] };
    const templates = body.templates ?? [];
    return templates.length > 0 ? templates : null;
  } catch {
    return null;
  }
}

async function fromGitHub(): Promise<MirroredTemplate[] | null> {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  try {
    const listing = await fetch(
      `https://api.github.com/repos/${REPO}/contents/.github/ISSUE_TEMPLATE`,
      { headers },
    );
    if (!listing.ok) return null;

    const entries = (await listing.json()) as { name?: string; download_url?: string }[];
    if (!Array.isArray(entries)) return null;

    // `config.yml` is the chooser's own settings rather than a form.
    const wanted = entries.filter(
      (e) => e.name && e.name !== 'config.yml' && e.name.endsWith('.yml') && e.download_url,
    );

    const out: MirroredTemplate[] = [];
    for (const entry of wanted) {
      const res = await fetch(entry.download_url as string);
      if (!res.ok) return null;
      out.push({ file: entry.name as string, yaml: await res.text() });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Preferring kittiwake's mirror, falling back to the repository itself.
 *
 * The mirror is the source of truth and is what keeps the compose page in step with the forms
 * upstream. The fallback exists because the page is useless while the mirror is unreachable, and
 * it reads the same files from the same repository, so it cannot disagree with it - only be
 * fresher.
 */
async function load(): Promise<IssueForm[]> {
  const raw = (await fromMirror()) ?? (await fromGitHub());
  if (!raw || raw.length === 0) throw new Error('no issue templates could be read');

  const forms: IssueForm[] = [];
  for (const t of raw) {
    try {
      forms.push(parseIssueForm(t.file, t.yaml));
    } catch (e) {
      // One unparseable template must not take the other five down with it.
      log.api.warn({ file: t.file, err: String(e) }, 'graph-support issue template did not parse');
    }
  }
  if (forms.length === 0) throw new Error('no issue template parsed');
  return forms;
}

/** Throws when the forms cannot be read, which both callers answer 503 to. */
export function issueForms(): Promise<IssueForm[]> {
  return cached<IssueForm[]>('lodestar:graph-support-forms', TEMPLATE_TTL_SECONDS, load);
}
