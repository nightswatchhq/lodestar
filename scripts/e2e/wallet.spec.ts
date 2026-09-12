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
/**
 * Somebody else's portfolio, with a live position on it.
 *
 * Confirmed against `/api/portfolio?type=delegator` rather than picked out of the events feed: the
 * first address I took from there had delegated once and withdrawn since, so the page had no rows
 * and the test passed for the wrong reason - no "Manage" button because there was nothing to
 * manage, which is not the property being asserted.
 */
const SOMEONE_ELSE = '0xa244c90fa973b485d6a63c8af33fc9bc06c40d7e';

/** Open a page with the test wallet installed and connected through the injected connector. */
async function connected(page: Page, path: string): Promise<void> {
  await installTestWallet(page);

  // Connect on the home page and then navigate, rather than connecting wherever the test wants to
  // be. Two reasons, and the second is why this is not just tidiness.
  //
  // It is how a real visitor arrives: wallet attached before they open a portfolio.
  //
  // And the connector dropdown is a floating element over a page that is still rendering. On
  // `/delegators/…`, which loads a whole portfolio, Playwright resolved the "Injected" button and
  // then watched it detach mid-click, retrying until the test timed out. Waiting for the page to
  // settle first would be guessing at how long that takes; connecting somewhere quiet does not.
  await page.goto('/');
  const account = page.getByRole('button', { name: /0x0000.*ea5E/i }).first();
  const connect = page.getByRole('button', { name: /connect wallet/i }).first();
  await expect(connect).toBeVisible();
  await connect.click();
  await page.getByRole('button', { name: /^injected$/i }).first().click();
  await expect(account).toBeVisible();

  // wagmi records the connector and reconnects on the next page, exactly as it does for a returning
  // visitor. Asserting the address again is what proves that rather than assuming it.
  await page.goto(path);
  await expect(account).toBeVisible();
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

/**
 * Undelegate, from the only two angles a burner can reach.
 *
 * Both are refusals, and both are properties worth holding. Offering "Manage" against a position
 * that does not exist is a bug; offering it against somebody else's position is a worse one.
 */
test('undelegate is not offered on a portfolio with nothing in it', async ({ page }) => {
  await connected(page, `/delegators/${TEST_ADDRESS}`);
  await expect(page.getByRole('button', { name: /^manage$/i })).toHaveCount(0);
  expect(await sentTransactions(page)).toEqual([]);
});

/**
 * The authorisation property. `isOwnPortfolio` is what gates the control, and a connected wallet
 * looking at a stranger's positions must see the numbers and no way to touch them.
 */
test("undelegate is not offered on somebody else's portfolio", async ({ page }) => {
  await connected(page, `/delegators/${SOMEONE_ELSE}`);
  // The page has to have actually loaded a position, or the absence of a control asserts nothing.
  //
  // The first version of this waited for `getByText(/0x/)`, which matches the connected address in
  // the topbar and is therefore true on every page in the site. It passed in 1.2 seconds against a
  // portfolio it had not waited for, which is the shape of a test that checks nothing.
  //
  // "Unrealized P&L" is a column header in the positions table and appears nowhere else.
  await expect(page.getByText(/Unrealized P&L/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^manage$/i })).toHaveCount(0);
  expect(await sentTransactions(page)).toEqual([]);
});

/**
 * Dock lifecycle - transfer, deprecate, update metadata on chain - sits behind two gates, and a
 * connected wallet has only passed the first. The panel lives inside a subgraph's detail modal,
 * which needs a signed-in Dock session, so none of its controls may be anywhere on the page.
 *
 * Worth asserting rather than assuming: "deprecate" is irreversible and "transfer ownership" hands
 * an NFT to someone else, so a rendering bug that exposed either to an unauthenticated visitor
 * would be expensive in a way no other check here would catch.
 */
test('dock lifecycle controls are unreachable without a session', async ({ page }) => {
  await connected(page, '/dock/subgraphs');
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();

  for (const control of [/transfer ownership/i, /deprecate/i, /update metadata on-chain/i]) {
    await expect(page.getByRole('button', { name: control })).toHaveCount(0);
  }
  expect(await sentTransactions(page)).toEqual([]);
});
