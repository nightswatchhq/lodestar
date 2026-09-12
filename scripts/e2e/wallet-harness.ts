import type { Page } from '@playwright/test';

/**
 * A wallet that cannot spend anything.
 *
 * ## Why this exists
 *
 * Five write flows - delegate, undelegate, curate signal, Dock publish, Dock lifecycle - are the
 * only paths the Vitest suite cannot cover, because reaching them needs a connected wallet. They
 * are also the paths where a migration regression would be expensive, which is the whole argument
 * for smoke-testing them at all. A broken import, a lost ABI or a hook that stopped firing is
 * invisible to every other check here and obvious to this one.
 *
 * ## The safety property, which is the part to read
 *
 * **This provider has no RPC and cannot obtain one.** `eth_sendTransaction` records the call and
 * returns a canned hash without broadcasting it anywhere; nothing signs with a real key, because
 * there is no key. Any method not listed below **throws** rather than falling through to something
 * that might reach a chain: a silent fallthrough is how a test harness ends up spending money, and
 * a thrown "unhandled method" in a test report costs an afternoon instead.
 *
 * The address is a burner with no funds and no history. If one of these tests ever does reach a
 * chain, it reaches it as an account that can do nothing.
 *
 * ## What it is honestly good for
 *
 * Up to **dispatch**: connect, the form validating, and the write going out with the right
 * contract, function and arguments. Not the mined ceremony - `useWaitForTransactionReceipt` polls
 * through wagmi's `http()` transport rather than the connector, so a canned hash is a hash the
 * real Arbitrum RPC has never heard of and never will. That half is covered by unit tests
 * (`useContractStep`, `SubgraphLifecyclePanel`), which can drive it directly.
 *
 * Claiming more than dispatch would be the mistake this repository keeps finding in other people's
 * code: a check that looks like it covers a thing and does not.
 */

/**
 * A burner. No funds, no history, and nothing here can sign for it anyway.
 *
 * Forty hex characters, which is worth saying because the first version of this had forty-two.
 * wagmi ran it through viem's `getAddress`, which threw, and the connect went silently nowhere:
 * `eth_requestAccounts` was answered and `eth_chainId` was never asked. The provider looked fine
 * and the page still said "Connect Wallet".
 */
export const TEST_ADDRESS = '0x000000000000000000000000000000000d15ea5e';

const ARBITRUM = '0xa4b1';

/** What the page asked the wallet to do, in order. */
export interface SentTransaction {
  to: string;
  data: string;
  value?: string;
}

/**
 * Install the provider before any page script runs.
 *
 * `addInitScript` rather than an `evaluate` after navigation: wagmi's `injected()` connector looks
 * for `window.ethereum` during hydration, and a provider that arrives afterwards is a provider
 * nothing connected to.
 */
export async function installTestWallet(page: Page): Promise<void> {
  await page.addInitScript(
    ({ address, chainId }) => {
      type Sent = { to: string; data: string; value?: string };
      const sent: Sent[] = [];

      // A hash shaped like a real one so nothing downstream chokes on its length. It corresponds
      // to no transaction on any chain, which is the point.
      const CANNED_HASH = `0x${'ab'.repeat(32)}`;

      const listeners = new Map<string, ((...args: unknown[]) => void)[]>();

      const provider = {
        isMetaMask: true,
        // Read by the tests through `page.evaluate`, so an assertion can name the contract and the
        // selector the page actually dispatched rather than merely that something happened.
        __sent: sent,
        async request({ method, params }: { method: string; params?: unknown[] }) {
          switch (method) {
            case 'wallet_requestPermissions':
            case 'wallet_getPermissions':
              // wagmi's injected connector asks for these first, to force a real wallet to show
              // its account picker. Throwing here does not fail the connect, but it does send the
              // connector down a different path, so it is answered properly.
              return [{ parentCapability: 'eth_accounts', caveats: [] }];
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [address];
            case 'eth_chainId':
              return chainId;
            case 'net_version':
              return String(parseInt(chainId, 16));
            case 'wallet_switchEthereumChain':
            case 'wallet_addEthereumChain':
              return null;
            case 'eth_sendTransaction': {
              const tx = (params?.[0] ?? {}) as Sent;
              sent.push({ to: tx.to, data: tx.data, value: tx.value });
              return CANNED_HASH;
            }
            case 'personal_sign':
            case 'eth_signTypedData_v4':
              // A signature of the right shape. It verifies as nothing, which is correct: no test
              // here asserts that a signature is valid, and one that did would be lying.
              return `0x${'11'.repeat(65)}`;
            default:
              // Deliberately not a fallthrough to anything. See the note at the top.
              throw new Error(
                `the test wallet was asked for "${method}", which it does not implement. ` +
                  'Add it here rather than pointing this at an RPC.',
              );
          }
        },
        on(event: string, fn: (...args: unknown[]) => void) {
          listeners.set(event, [...(listeners.get(event) ?? []), fn]);
        },
        removeListener(event: string, fn: (...args: unknown[]) => void) {
          listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== fn));
        },
      };

      Object.defineProperty(window, 'ethereum', { value: provider, writable: false });
    },
    { address: TEST_ADDRESS, chainId: ARBITRUM },
  );
}

/** Everything the page has asked the wallet to send, in order. */
export async function sentTransactions(page: Page): Promise<SentTransaction[]> {
  return page.evaluate(
    () => (window as unknown as { ethereum?: { __sent?: SentTransaction[] } }).ethereum?.__sent ?? [],
  );
}

/** The four-byte selector a call begins with, which is what names the function. */
export function selectorOf(tx: SentTransaction): string {
  return (tx.data ?? '').slice(0, 10).toLowerCase();
}
