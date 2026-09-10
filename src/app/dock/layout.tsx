'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn, shortenAddress } from '@/lib/utils';
import { ConnectGate } from '@/features/dock/components/ConnectGate';
import { useStudioSession } from '@/features/dock/session';

/**
 * The Dock's chrome: header, wallet gate, sign-in, and the tab bar.
 *
 * The tabs were `useState`, which meant the two halves of the Dock had no addresses of their own.
 * A reload put you back on My Subgraphs, the browser's back button left the page entirely, and the
 * indexer guide in the blog could only ever link at the Dock in general and tell the reader to
 * click. They are routes now and the tab bar is links, so the state lives where a URL can carry
 * it.
 *
 * A layout rather than a shared component because the session is read once here instead of once
 * per tab: two `useSession` calls share react-query's cache, but only after the first has
 * resolved, and the second tab would still flash its own loading state on every switch.
 */

const TABS = [
  { href: '/dock/subgraphs', label: 'My Subgraphs' },
  { href: '/dock/bounties', label: 'Bounty Board' },
];

export default function DockLayout({ children }: { children: React.ReactNode }) {
  const { sessionAddress, sessionLoading, signing, error: authError, signIn, signOut } =
    useStudioSession();
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">Subgraph Dock</h1>
            <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-500">
              Experimental
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Deploy subgraphs to The Graph Network. No limits, no gatekeepers.
          </p>
        </div>
        {sessionAddress && (
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--green)]" />
              <span className="font-mono text-xs text-[var(--text-muted)]">
                {shortenAddress(sessionAddress)}
              </span>
            </div>
            <button
              onClick={signOut}
              className="text-xs text-[var(--text-faint)] transition-colors hover:text-[var(--text)]"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      <ConnectGate>
        {/* Withheld while the session is still being read: "not loaded yet" and "signed out" are
            different answers, and conflating them put this in front of people already signed in. */}
        {!sessionLoading && !sessionAddress && (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-dim)]">
              <svg className="h-7 w-7 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Sign in with your wallet</h2>
              <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
                One signature, no gas, no transaction. Proves you own this address.
              </p>
            </div>
            <button
              onClick={signIn}
              disabled={signing}
              className="rounded-[var(--radius-button)] bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {signing ? 'Waiting for wallet...' : 'Sign in'}
            </button>
            {authError && <p className="text-xs text-[var(--red-text)]">{authError}</p>}
          </div>
        )}

        {sessionAddress && (
          <>
            <div className="flex gap-1 border-b border-[var(--border)]">
              {TABS.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cn(
                    '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                    pathname === t.href
                      ? 'border-[var(--accent)] text-[var(--accent-text)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
            <div className="pt-2">{children}</div>
          </>
        )}
      </ConnectGate>
    </div>
  );
}
