'use client';

import { useCallback, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { buildSignInMessage } from '@/lib/studio/sign-in-message';
import { useSession, useSignIn, useSignOut } from './api';

export function useStudioSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Was a raw fetch in a mount effect with `.catch(() => setSessionAddress(null))`, which reported
  // a broken session endpoint as "signed out" and put the sign-in prompt in front of somebody who
  // already had a session.
  const session = useSession();
  const signInMutation = useSignIn();
  const signOutMutation = useSignOut();

  const signIn = useCallback(async () => {
    if (!address) return;
    setSigning(true);
    setError(null);
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const message = buildSignInMessage(address, timestamp);
      const signature = await signMessageAsync({ message });
      await signInMutation.mutateAsync({ address, message, signature });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSigning(false);
    }
  }, [address, signMessageAsync, signInMutation]);

  const signOut = useCallback(async () => {
    await signOutMutation.mutateAsync();
  }, [signOutMutation]);

  return {
    sessionAddress: session.data?.address ?? null,
    // A session that has not loaded is not a session that is absent. Rendering the sign-in prompt
    // during the first read is what made the Dock flash it on every navigation.
    sessionLoading: session.isPending,
    signing,
    error,
    signIn,
    signOut,
  };
}