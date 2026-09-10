import { NextResponse } from 'next/server';

import { cached } from '@/lib/cache';
import { log } from '@/lib/logger';
import type { SupportArchive, SupportIssue } from '@/lib/graph-support';

const REPO = 'nightswatchhq/graph-support';

// No credential. This route is the rollback path for an archive kittiwake now serves, and the
// token it used to carry was removed from the project after it expired unnoticed; naming it here
// only sent the next reader looking for something that does not exist.
const GH_HEADERS: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };

/**
 * Fifteen minutes. Unauthenticated GitHub allows sixty requests an hour against a shared
 * per-IP budget, and this route spends one or two of them per miss; the archive is a
 * write-up store rather than a live feed, so it does not need to be fresher than this.
 */
const TTL_SECONDS = 900;

/** Enough for the repo to grow thirty-fold before the cap is the thing that truncates it. */
const MAX_PAGES = 10;

/** Only the fields read below. */
interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  labels?: { name?: string }[];
  comments?: number;
  created_at: string;
  updated_at: string;
  /** Present on pull requests, which the issues endpoint returns alongside issues. */
  pull_request?: unknown;
}

/**
 * Thrown when GitHub could not be read, so `cached` stores nothing and the route answers 503.
 *
 * What it must never do is fold the failure into an empty array. That would cache an empty
 * archive for fifteen minutes and render it as "no issues" - thirty-three worked answers reading
 * as none, with a 200 on it. Absent data must read as absent.
 */
class UpstreamError extends Error {}

async function fetchAllIssues(): Promise<SupportIssue[]> {
  const collected: SupportIssue[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `https://api.github.com/repos/${REPO}/issues` +
      `?state=all&sort=updated&direction=desc&per_page=100&page=${page}`;

    const res = await fetch(url, { headers: GH_HEADERS });
    if (!res.ok) {
      log.api.warn(
        {
          status: res.status,
          page,
          // 403 with no quota left is rate limiting rather than a bad credential.
          rateLimitRemaining: res.headers.get('x-ratelimit-remaining'),
        },
        'GitHub rejected a graph-support request; unauthenticated reads share a per-IP hourly budget',
      );
      throw new UpstreamError(`GitHub answered ${res.status}`);
    }

    const batch: GitHubIssue[] = await res.json();
    if (!Array.isArray(batch)) throw new UpstreamError('GitHub returned a non-array body');

    for (const issue of batch) {
      // The issues endpoint returns pull requests too, and they are not support threads.
      if (issue.pull_request) continue;
      collected.push({
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        state: issue.state === 'closed' ? 'closed' : 'open',
        labels: (issue.labels ?? []).map((l) => l.name ?? '').filter((n) => n !== ''),
        comments: issue.comments ?? 0,
        createdAt: issue.created_at,
        updatedAt: issue.updated_at,
      });
    }

    if (batch.length < 100) break;
  }

  // A repo that answered 200 with nothing in it is the failure this route is most likely to hit
  // silently, so it is treated as a failure rather than published as an empty archive.
  if (collected.length === 0) throw new UpstreamError('GitHub returned no issues at all');

  return collected;
}

export async function GET() {
  try {
    const archive = await cached<SupportArchive>('lodestar:graph-support', TTL_SECONDS, async () => ({
      issues: await fetchAllIssues(),
      fetchedAt: new Date().toISOString(),
    }));

    return NextResponse.json(archive, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof UpstreamError ? e.message : 'graph-support could not be read' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
