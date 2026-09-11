import { describe, expect, it } from 'vitest';

import { buildSignInMessage } from '@/lib/studio/sign-in-message';

/**
 * Carried over from `auth.test.ts`, which went with the module it covered, and strengthened on the
 * way: this text is a contract with kittiwake, which recovers the signer from it. `toContain` would
 * pass on a message with an extra line or a different order, and either of those is a signature
 * that will not verify. So the whole string is pinned.
 */
describe('the message a wallet signs for a Dock session', () => {
  it('is exactly the text kittiwake recovers the signer from', () => {
    expect(buildSignInMessage('0xABC', 12345)).toBe(
      'Sign in to Lodestar Studio\n\nAddress: 0xABC\nTimestamp: 12345',
    );
  });

  it('keeps the address as given, since the signer is recovered against this exact text', () => {
    const mixed = '0xAbCdEf0123456789012345678901234567890123';
    expect(buildSignInMessage(mixed, 1)).toContain(`Address: ${mixed}`);
  });
});
