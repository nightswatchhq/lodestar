import type { Metadata } from 'next';
import { serverApiUrl } from '@/lib/api-origin';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge } from '@/components/ui/Badge';
import {
  areasOf,
  dispositionLabel,
  ownerLabel,
  primaryDisposition,
  primaryOwner,
} from '@/lib/graph-support';
import { renderThreadMarkdown, type SupportThread } from '@/lib/graph-support-thread';

/**
 * Read the thread through whatever `api-origin` says, same as every client fetch.
 *
 * It used to build `${proto}://${host}/api/…` deliberately, so that it went through the edge
 * rewrite with everything else and clearing the switch rolled it back with the rest rather than
 * leaving this one page pointed at the backend on its own. `serverApiUrl` keeps that property and
 * makes it the same switch the browser now uses.
 */
async function fetchThread(number: string): Promise<SupportThread | null> {
  const h = await headers();
  const host = h.get('host');
  if (!host) return null;
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const res = await fetch(serverApiUrl(`/api/support/${number}`, { proto, host }), {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  const thread = await fetchThread(number);
  if (!thread) return { title: 'Support | Lodestar' };
  return {
    title: `#${thread.issue.number} ${thread.issue.title} | Lodestar`,
    description: thread.issue.body.replace(/[#*`>\-|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
  };
}

function When({ iso }: { iso: string }) {
  return (
    <>
      {new Date(iso).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}
    </>
  );
}

/** The thread's own words. Sanitised in `renderThreadMarkdown`, which is where the danger is. */
async function Prose({ markdown }: { markdown: string }) {
  const rendered = await renderThreadMarkdown(markdown);
  return (
    <div
      className="prose prose-invert max-w-none prose-sm prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-[var(--accent-text)] prose-pre:bg-[var(--bg-elevated)] prose-pre:text-xs prose-code:text-[var(--accent-text)] prose-img:rounded-lg"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

export default async function SupportIssuePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const thread = await fetchThread(number);
  if (!thread) notFound();

  const { issue, comments } = thread;
  const owner = primaryOwner(issue);
  const disposition = primaryDisposition(issue);
  const areas = areasOf(issue);
  const resolved = issue.state === 'closed';

  return (
    <article className="mx-auto max-w-3xl">
      <Link
        href="/support"
        className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
      >
        &larr; Support
      </Link>

      <header className="mt-3 mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-faint)]">#{issue.number}</span>
          <Badge variant={resolved ? 'success' : 'warning'}>{resolved ? 'Resolved' : 'Open'}</Badge>
          {owner && <Badge variant="accent">{ownerLabel(owner)}</Badge>}
          {resolved && disposition && <Badge variant="default">{dispositionLabel(disposition)}</Badge>}
        </div>

        <h1 className="text-2xl font-bold leading-snug tracking-tight text-[var(--text)]">
          {issue.title}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--text-faint)]">
          {areas.length > 0 && <span>{areas.join(', ')}</span>}
          <span>
            opened <When iso={issue.createdAt} />
          </span>
          <span>
            last activity <When iso={issue.updatedAt} />
          </span>
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            View on GitHub &rarr;
          </a>
        </div>
      </header>

      {/* The state, said in the labels' own terms rather than summarised out of the prose. What a
          thread means is a judgement its author already made; the labels are where they made it. */}
      <div className="mb-8 rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
        <p className="text-xs leading-relaxed text-[var(--text-muted)]">
          {resolved && disposition === 'fixed' && 'Closed as fixed: the fault is gone, not merely understood.'}
          {resolved && disposition === 'root-cause-found' &&
            'Closed with a root cause: the mechanism is written up below, with the check that distinguishes it.'}
          {resolved && disposition === 'handed-off' &&
            'Closed as handed off: it belongs to someone else, and the thread records where and when it was raised.'}
          {resolved && disposition === 'cannot-reproduce' &&
            'Closed as not reproducible. Worth reading for what was ruled out.'}
          {resolved && disposition === 'out-of-scope' && 'Closed as out of scope, rather than left open indefinitely.'}
          {resolved && !disposition && 'Closed without a disposition, which the triage process says should not happen.'}
          {!resolved && issue.labels.includes('handed-off') &&
            'Handed off and still open, which is deliberate: handed off is not closed. It stays open until there is an outcome.'}
          {!resolved && !issue.labels.includes('handed-off') && owner &&
            `Open. ${ownerLabel(owner)} can act on this; nobody else can.`}
          {!resolved && !issue.labels.includes('handed-off') && !owner &&
            'Open, and nobody has yet said whose it is.'}
        </p>
        <p className="mt-1 text-[11px] text-[var(--text-faint)]">
          Below is the thread as written. Nothing here is summarised: that repository marks
          inference as inference, and a paraphrase loses exactly that.
        </p>
      </div>

      <Prose markdown={issue.body} />

      {comments.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold tracking-tight text-[var(--text)]">
            {comments.length} {comments.length === 1 ? 'reply' : 'replies'}
          </h2>
          <div className="space-y-6">
            {comments.map((c) => (
              <div
                key={c.id}
                className="rounded-[var(--radius-card)] border-[0.5px] border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3"
              >
                <div className="mb-2 flex items-center gap-2 text-[11px] text-[var(--text-faint)]">
                  <span className="font-medium text-[var(--text-muted)]">{c.author}</span>
                  <When iso={c.createdAt} />
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto hover:text-[var(--accent-text)]"
                  >
                    link
                  </a>
                </div>
                <Prose markdown={c.body} />
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-muted)]">
        <p>
          Hitting the same thing?{' '}
          <a
            href={issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            Reply on the thread
          </a>{' '}
          rather than opening a duplicate, or{' '}
          <Link href="/support/new" className="text-[var(--accent-text)] hover:underline">
            file a new issue
          </Link>{' '}
          if yours is different.
        </p>
      </footer>
    </article>
  );
}
