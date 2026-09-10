import type { Metadata } from 'next';
import Link from 'next/link';

import SupportArchive from './SupportArchive';

export const metadata: Metadata = {
  title: 'Support | Lodestar',
  description:
    'Worked answers for The Graph: root causes, workarounds, and who can actually fix it. Read live from the nightswatchhq/graph-support archive.',
};

const REPO_URL = 'https://github.com/nightswatchhq/graph-support';
const DISCORD_URL = 'https://discord.gg/CQewvyJ69Y';
const LODESTAR_ISSUES_URL = 'https://github.com/nightswatchhq/lodestar/issues';

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text)]">Support</h1>
          <Link
            href="/support/new"
            className="shrink-0 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            New issue
          </Link>
        </div>
        <p className="mt-3 max-w-2xl text-[var(--text-muted)]">
          Something in The Graph is broken and nobody is answering. These are the threads where it
          got worked out: a root cause, a workaround, or the name of the party who can actually fix
          it. Read live from{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            nightswatchhq/graph-support
          </a>
          , which is run by The Night&rsquo;s Watch and is not Edge &amp; Node or the Foundation.
        </p>
      </div>

      <SupportArchive />

      <div className="mt-10 border-t border-[var(--border)] pt-6 text-sm text-[var(--text-muted)]">
        <p className="max-w-2xl">
          Not here?{' '}
          <Link href="/support/new" className="text-[var(--accent-text)] hover:underline">
            Open an issue
          </Link>{' '}
          so the answer ends up permanent and searchable, or come to{' '}
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            the Night&rsquo;s Watch Discord
          </a>{' '}
          to talk it through while someone is looking. For a bug in Lodestar itself rather than in
          the protocol, use{' '}
          <a
            href={LODESTAR_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--accent-text)] hover:underline"
          >
            the Lodestar issue tracker
          </a>
          .
        </p>
      </div>
    </div>
  );
}
