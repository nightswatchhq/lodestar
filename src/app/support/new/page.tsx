import type { Metadata } from 'next';
import Link from 'next/link';

import NewIssueChooser from './NewIssueChooser';

export const metadata: Metadata = {
  title: 'File a support issue | Lodestar',
  description:
    'File an issue against nightswatchhq/graph-support: community triage for The Graph, where you get a root cause, a workaround, or the name of whoever can actually fix it.',
};

/**
 * `searchParams` carries `?title=`, which `/support` sets when a search found nothing. The string
 * somebody typed while their thing was broken is usually the best title the thread will ever get.
 */
export default async function NewIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const { title } = await searchParams;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <Link
          href="/support"
          className="text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent-text)]"
        >
          &larr; Support
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-[var(--text)]">
          File an issue
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--text-muted)]">
          It goes to{' '}
          <a
            href="https://github.com/nightswatchhq/graph-support"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            nightswatchhq/graph-support
          </a>
          , community triage run by The Night&rsquo;s Watch. You get a root cause, a workaround, or
          the name of the party who can actually fix it, and the thread stays public so the next
          person finds it. Filing needs a GitHub account and the issue is opened under your own
          name, not Lodestar&rsquo;s.
        </p>
      </div>

      {/* Every one of the six templates leads with a version of this, and somebody arriving from
          here would otherwise meet it only after they had already pasted. */}
      <div className="mb-8 rounded-[var(--radius-card)] border-[0.5px] border-[var(--amber-dim)] bg-[var(--bg-surface)] px-4 py-3">
        <p className="text-xs leading-relaxed text-[var(--amber)]">
          Do not paste an API key, a deploy key, an operator key, a mnemonic, a keystore or the
          contents of an <code>.env</code>. A gateway query URL contains an API key: redact it as{' '}
          <code>gateway.thegraph.com/api/&lt;KEY&gt;/…</code>.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          If you have already posted a key somewhere, rotate it rather than editing the message.
          Editing does not remove it from the history.
        </p>
      </div>

      <NewIssueChooser initialTitle={title ?? ''} />
    </div>
  );
}
