/**
 * The six graph-support issue forms, for the compose page to render.
 *
 * A read, and on its own path rather than sharing one with `/api/file-issue`, because the rate
 * limiter buckets by path and not by method: three writes a minute is right for opening issues in
 * a public repository and would lock a reader out of the form on their third page load.
 */

import { NextResponse } from 'next/server';

import { log } from '@/lib/logger';
import { CHOOSER_URL, issueForms, issueToken } from '@/lib/graph-support-forms';

export async function GET() {
  try {
    const templates = await issueForms();
    return NextResponse.json(
      { templates, canFile: Boolean(issueToken()), chooserUrl: CHOOSER_URL },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    log.api.warn({ err: String(e) }, 'graph-support issue forms could not be read');
    return NextResponse.json(
      { error: 'The issue forms could not be read.', chooserUrl: CHOOSER_URL },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
