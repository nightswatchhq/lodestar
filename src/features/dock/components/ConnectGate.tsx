'use client';

import { useAccount } from 'wagmi';

export function ConnectGate({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--accent-text)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[var(--text)] mb-2">Connect your wallet</h2>
          <p className="text-[var(--text-muted)] text-sm max-w-sm">
            Connect via the button in the top bar, then sign in to manage your subgraphs.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}