import { expect, test, type Page } from '@playwright/test';

import { installTestWallet, sentTransactions, TEST_ADDRESS } from './wallet-harness';

/**
 * The five write flows, as far as a browser can honestly take them.
 *
 * ## Why these and not others
 *
 * Delegate, undelegate, curate signal, Dock publish and Dock lifecycle are the only paths the
 * Vitest suite cannot reach, because reaching them needs a connected wallet. They are also where a
 * migration regression is expensive: a lost provider, a hook that stopped firing, a hydration
 * mismatch that leaves the page on "Connect Wallet" for ever. None of that is visible to any other
 * check here.
 *
 * ## What these tests actually assert, which is less than five end-to-end transactions
 *
 * The wallet connects, the page reaches its write surface, and **an account with no GRT is told so
 * and cannot dispatch anything**. That last one is a real safety property rather than a
 * consolation prize: the delegate button refusing an unfunded account is the app declining to
 * prompt for a transaction it knows will fail.
 *
 * They do **not** assert a successful dispatch. Doing that needs either a funded account - real
 * money, on a public chain, from CI - or an interceptor sitting in front of the Arbitrum RPC to
 * fake `balanceOf` and `allowance`, because those reads go through wagmi's `http()` transport
 * rather than the connector. The second is buildable and is not built; the first is not going to
 * happen. Saying so here is the point, because a check that looks like it covers a thing and does
 * not is the exact defect this repository keeps finding in its own code.
 *
 * The mined ceremony - prompt, mining, reverted, done - is unit-tested where it can be driven
 * directly: see `useContractStep` and `SubgraphLifecyclePanel`.
 */

const INDEXER = '0x4e5c87772c29381bcabc58c3f182b6633b5a274a';

/** Open a page with the test wallet installed and connected through the injected connector. */
async function connected(page: Page, path: string): Promise<void> {
  await installTestWallet(page);
  await page.goto(path);
  // Client-rendered: the shell arrives first and the wallet controls follow.
  await page.waitForTimeout(6000);

  const connect = page.getByRole('button', { name: /connect wallet/i }).first();
  if (await connect.count()) {
    await connect.click();
    await page.getByRole('button', { name: /^injected$/i }).first().click();
  }
  // The topbar shows the shortened address once wagmi has the account.
  await expect(page.getByRole('button', { name: /0x0000.*ea5E/i }).first()).toBeVisible();
}

test('the injected connector connects, and the address reaches the page', async ({ page }) => {
  await connected(page, `/indexers/${INDEXER}/delegate`);
  const accounts = await page.evaluate(() =>
    (window as unknown as { ethereum: { request(a: unknown): Promise<string[]> } }).ethereum.request({
      method: 'eth_accounts',
    }),
  );
  expect(accounts[0].toLowerCase()).toBe(TEST_ADDRESS);
});

/**
 * The delegate page must not offer to spend GRT that is not there.
 *
 * This is the assertion that survives having no funds, and it is worth having on its own: the
 * button is disabled and the reason is in words, rather than the page prompting a wallet for a
 * transaction the chain would reject.
 */
test('delegate refuses an account with no GRT, and dispatches nothing', async ({ page }) => {
  await connected(page, `/indexers/${INDEXER}/delegate`);

  const amount = page.getByPlaceholder("0.00").first();
  await expect(amount).toBeVisible();
  await amount.fill('100');

  const refusal = page.getByRole('button', { name: /insufficient grt balance/i });
  await expect(refusal).toBeVisible();
  await expect(refusal).toBeDisabled();

  expect(
    await sentTransactions(page),
    'the page asked the wallet to send something for an account with no GRT',
  ).toEqual([]);
});

test('curate reaches its signal surface with a wallet attached', async ({ page }) => {
  await connected(page, '/curate');
  // Both tabs render only once there is an account to have positions for.
  await expect(page.getByRole('button', { name: /^discover$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /my positions/i })).toBeVisible();
  expect(await sentTransactions(page)).toEqual([]);
});

/**
 * The Dock's second gate.
 *
 * Connecting a wallet is not signing in: the Dock wants a SIWE signature on top, and the thing
 * that would break silently is the page staying on "Connect Wallet" after a connection, which is
 * indistinguishable from a wallet that did not attach.
 */
test('the Dock offers to sign in once a wallet is connected', async ({ page }) => {
  await connected(page, '/dock/subgraphs');
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^connect wallet$/i })).toHaveCount(0);
  expect(await sentTransactions(page)).toEqual([]);
});
