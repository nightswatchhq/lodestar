'use client';

import { useState } from 'react';
import { cn, shortenAddress } from '@/lib/utils';
import { ConnectGate } from '@/features/dock/components/ConnectGate';
import { MySubgraphsTab } from '@/features/dock/components/MySubgraphsTab';
import { BountyBoardTab } from '@/features/dock/components/BountyBoardTab';
import { useStudioSession } from '@/features/dock/session';

type Tab = 'subgraphs' | 'bounties';

export default function StudioPage() {
  const { sessionAddress, sessionLoading, signing, error: authError, signIn, signOut } =
    useStudioSession();
  const [tab, setTab] = useState<Tab>('subgraphs');

  const TABS: { id: Tab; label: string }[] = [
    { id: 'subgraphs', label: 'My Subgraphs' },
    { id: 'bounties', label: 'Bounty Board' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--text)]">Subgraph Dock</h1>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/15 text-amber-500 border border-amber-500/30">
              Experimental
            </span>
          </div>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Deploy subgraphs to The Graph Network. No limits, no gatekeepers.
          </p>
        </div>
        {sessionAddress && (
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] inline-block" />
              <span className="text-xs font-mono text-[var(--text-muted)]">{shortenAddress(sessionAddress)}</span>
            </div>
            <button
              onClick={signOut}
              className="text-xs text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      <ConnectGate>
        {/* Sign-in prompt. Withheld while the session is still being read: "not loaded yet" and
            "signed out" are different answers, and showing this during the first read put the
            prompt in front of people who were already signed in. */}
        {!sessionLoading && !sessionAddress && (
          <div className="flex flex-col items-center py-16 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
              <svg className="w-7 h-7 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text)]">Sign in with your wallet</h2>
              <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm">
                One signature, no gas, no transaction. Proves you own this address.
              </p>
            </div>
            <button
              onClick={signIn}
              disabled={signing}
              className="px-6 py-2.5 text-sm font-medium rounded-[var(--radius-button)] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {signing ? 'Waiting for wallet...' : 'Sign in'}
            </button>
            {authError && <p className="text-xs text-[var(--red-text)]">{authError}</p>}
          </div>
        )}

        {/* Signed-in view */}
        {sessionAddress && (
          <>
            <div className="flex gap-1 border-b border-[var(--border)]">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                    tab === t.id
                      ? 'border-[var(--accent)] text-[var(--accent-text)]'
                      : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="pt-2">
              {tab === 'subgraphs' && <MySubgraphsTab sessionAddress={sessionAddress} />}
              {tab === 'bounties' && <BountyBoardTab sessionAddress={sessionAddress} />}
            </div>
          </>
        )}
      </ConnectGate>
    </div>
  );
}
