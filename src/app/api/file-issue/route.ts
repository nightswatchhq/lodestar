/**
 * Opens an issue in `nightswatchhq/graph-support` on a reporter's behalf.
 *
 * It lives outside `/api/support` on purpose: everything under that prefix is proxied to kittiwake
 * by `src/proxy.ts`, and this handler has to stay in Next because it is the only thing holding the
 * credential.
 *
 * The credential is one account, so every thread filed here is authored by it. `provenanceFooter`
 * says so in the body rather than letting the archive imply the maintainer reported it themselves.
 */

import { NextResponse } from 'next/server';

import { log } from '@/lib/logger';
import { CHOOSER_URL, REPO, issueForms, issueToken } from '@/lib/graph-support-forms';
import {
  provenanceFooter,
  renderIssueBody,
  validateIssueForm,
  type IssueForm,
  type IssueFormValues,
} from '@/lib/issue-form';

/** Long enough for a stack trace and a query, short enough that nobody pastes a database in. */
const MAX_FIELD_CHARS = 20_000;
const MAX_TITLE_CHARS = 256;
const MIN_TITLE_CHARS = 8;

interface Payload {
  template?: unknown;
  title?: unknown;
  values?: unknown;
  handle?: unknown;
  /** Honeypot. A real form leaves it empty because it is never shown. */
  website?: unknown;
}

/** Coerces the posted answers into the shape `renderIssueBody` takes, dropping anything else. */
function readValues(raw: unknown): IssueFormValues {
  if (!raw || typeof raw !== 'object') return {};
  const out: IssueFormValues = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      out[key] = value.slice(0, MAX_FIELD_CHARS);
    } else if (Array.isArray(value)) {
      out[key] = value.filter((v) => typeof v === 'string').map((v) => v.slice(0, MAX_FIELD_CHARS));
    }
  }
  return out;
}

function bad(error: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return bad('The request body was not JSON.', 400);
  }

  if (typeof payload.website === 'string' && payload.website.trim() !== '') {
    return bad('Rejected.', 400);
  }

  const token = issueToken();
  if (!token) {
    // Not a failure the reporter caused, and their typing is still in the form, so the answer says
    // where else to put it rather than pretending the send worked.
    return bad('Filing from Lodestar is not configured. The issue can still be opened on GitHub.', 503, {
      chooserUrl: CHOOSER_URL,
    });
  }

  const file = typeof payload.template === 'string' ? payload.template : '';
  const title = (typeof payload.title === 'string' ? payload.title : '').trim();
  const handle = typeof payload.handle === 'string' ? payload.handle.slice(0, 120) : undefined;
  const values = readValues(payload.values);

  let forms: IssueForm[];
  try {
    forms = await issueForms();
  } catch {
    return bad('The issue forms could not be read, so nothing was filed.', 503, {
      chooserUrl: CHOOSER_URL,
    });
  }

  const form = forms.find((f) => f.file === file);
  if (!form) return bad('That is not one of the issue forms.', 400);

  if (title.length < MIN_TITLE_CHARS) {
    return bad('The title needs to say what broke, in at least a few words.', 400);
  }
  if (title.length > MAX_TITLE_CHARS) return bad('The title is too long.', 400);

  const errors = validateIssueForm(form, values);
  if (errors.length > 0) return bad(errors[0], 400, { errors });

  const body = `${renderIssueBody(form, values)}\n\n${provenanceFooter(handle)}`;

  let created: { number?: number; html_url?: string };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title, body, labels: form.labels }),
    });

    if (!res.ok) {
      log.api.warn(
        { status: res.status, file, rateLimitRemaining: res.headers.get('x-ratelimit-remaining') },
        'GitHub refused to open a graph-support issue',
      );
      return bad('GitHub refused the issue, so nothing was filed.', 502, { chooserUrl: CHOOSER_URL });
    }

    created = (await res.json()) as { number?: number; html_url?: string };
  } catch (e) {
    log.api.warn({ err: String(e), file }, 'GitHub could not be reached to open an issue');
    return bad('GitHub could not be reached, so nothing was filed.', 502, { chooserUrl: CHOOSER_URL });
  }

  if (typeof created.number !== 'number') {
    // The issue may well exist; what is missing is the number to send anyone to.
    return bad('The issue was accepted but GitHub did not say which number it got.', 502, {
      chooserUrl: CHOOSER_URL,
    });
  }

  return NextResponse.json(
    {
      number: created.number,
      url: created.html_url ?? `https://github.com/${REPO}/issues/${created.number}`,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
