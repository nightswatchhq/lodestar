/**
 * The exact text a wallet signs to open a Dock session.
 *
 * Byte for byte what kittiwake verifies against: it recovers the signer from this message, so a
 * stray space or a reordered line here is a signature that will not verify and a sign-in that
 * fails with nothing to point at.
 *
 * On its own rather than in `studio/auth.ts`, which read `SESSION_SECRET`. Nine of that module's
 * ten exports had no caller left once the Dock's session moved to kittiwake (kittiwake#16), and
 * this one is pure, so a client hook importing it was the only thing keeping a signing secret in
 * this project's environment.
 */
export function buildSignInMessage(address: string, timestamp: number): string {
  return `Sign in to Lodestar Studio\n\nAddress: ${address}\nTimestamp: ${timestamp}`;
}
