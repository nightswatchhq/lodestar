import { test, expect, type Page } from '@playwright/test';

/**
 * What a person actually sees. Every assertion here is about *rendered data*, never about the HTML
 * shell - the app is client-rendered, so a shell check passes on a page that shows nothing.
 *
 * #114 is the reason for the shape of these: `/indexers` returned 200, rendered its full table, and
 * every score, APR and eligibility cell was a dash. The page was "up" by every measure except the
 * only one that matters.
 */

/** Fail the test if the page logged an uncaught error while we were on it. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // **429s are not a rendering fault, and counting them as one made this suite flaky.** Run
    // back-to-back from one IP - which is exactly what a person debugging the monitor does - the
    // suite throttles itself and the home page logs a dozen of them, so the same page passed, then
    // failed, then failed again in three consecutive runs.
    //
    // A real cold load is clean: measured on production, 13 API calls, all 200, zero 429s. Rate
    // limiting is worth knowing about, but the API contract job is where it belongs; conflating it
    // with "the page is broken" is how a monitor earns a reputation for crying wolf (#120).
    if (/status of 429/.test(text)) return;
    errors.push(`console.error: ${text.slice(0, 200)}`);
  });
  return errors;
}

test('home renders live protocol numbers', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByText('Total Staked').first()).toBeVisible();
  // A number with a unit, not a placeholder dash.
  await expect(page.getByText(/[\d,.]+M GRT|[\d,.]+B GRT/).first()).toBeVisible();
  expect(errors, `console errors on /: ${errors.join(' | ')}`).toHaveLength(0);
});

test('state of network renders utilisation', async ({ page }) => {
  await page.goto('/network');
  await expect(page.getByText('Protocol utilization').first()).toBeVisible();
  await expect(page.getByText(/Current Epoch/i).first()).toBeVisible();
});

test('the indexer directory shows scores and APR, not dashes', async ({ page }) => {
  await page.goto('/indexers');
  await expect(page.getByRole('heading', { name: 'Indexer Directory' })).toBeVisible();
  // Wait for rows to arrive at all.
  await expect(page.getByText(/Showing 1 to \d+ of \d+ indexers/)).toBeVisible();

  // **Auto-retrying locators, not a one-shot innerText read.** The enriched payload arrives after the
  // first paint, so reading `main` at a fixed instant raced it: this passed in CI and failed locally
  // in the same minute, on a page that was demonstrably fine. A monitor that is flaky pages someone
  // at three in the morning for nothing, and is only slightly better than one that never fires.
  //
  // At least one row must carry a real percentage. A directory of dashes is the #114 outage.
  await expect(
    page.locator('td, [role="cell"]').filter({ hasText: /^\s*\d+\.\d+%/ }).first(),
    'no indexer shows a numeric APR or cut - the table is rendering its fallback path (#114)',
  ).toBeVisible({ timeout: 30_000 });

  // ...and none may report the oracle as unreadable, which is what all 80 did during #114.
  await expect(
    page.getByText('Oracle read unavailable').first(),
    'an indexer reports "Oracle read unavailable" - the enriched payload is not reaching the table (#114)',
  ).toBeHidden();
});

test('delegate offers a recommendation, or says plainly that it cannot', async ({ page }) => {
  await page.goto('/delegate');
  // The heading, specifically: "Delegate GRT" also appears in the nav and in a badge, and a bare
  // text locator matches all three and fails on strict mode rather than on the product.
  await expect(page.getByRole('heading', { name: 'Delegate GRT' })).toBeVisible();
  const body = (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  // The page must not sit silently between the two. #114: the recommendation was absent, the error
  // branch never rendered, and a user saw an explainer with no form and no explanation.
  const hasRecommendation = /Recommended|APR|Delegate to|Amount/i.test(body);
  const saysWhyNot = /Could not load recommendation|warming up|unavailable/i.test(body);
  expect(
    hasRecommendation || saysWhyNot,
    'the delegate page shows neither a recommendation nor an error - it looks intact and does nothing (#114)',
  ).toBe(true);
});

/**
 * The Delegation Activity filter, which crashed the same way the directory search did.
 *
 * `DelegationFeed` built a lookup with `map.set(idx.name.toLowerCase(), idx.id)` and `name` is null
 * for all 97 mainnet indexers, so the panel threw into an error boundary. It was reported as a
 * screenshot of "Something went wrong" and was found only because making the type honest made the
 * compiler point at it - never by a test, because nothing exercised this control.
 *
 * **Unproven against the bug, and said so rather than implied.** Restoring the unguarded
 * dereference and running this locally passes, because a local build has no database: the enriched
 * route answers 500, `enrichedData` is undefined, and the crashing loop never runs. The preview
 * environment is no better - it 503s on `/api/health` and `/api/network-stats` too. So this
 * exercises the control against production, where it is green, but the mutation that would prove it
 * needs an environment carrying both the regression and real data, which we do not have.
 */
test('the delegation activity filter does not throw on indexers with no name', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/delegators');
  const box = page.getByPlaceholder(/filter by indexer/i).first();
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.fill('0x4e5c');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);

  // The boundary, not the result: an empty filter result is fine, an unmounted panel is not.
  const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(
    /Something went wrong|Application error|Unhandled Runtime Error/i.test(body),
    'the delegation activity filter unmounted into an error boundary',
  ).toBe(false);
  expect(
    errors.filter((e) => /toLowerCase|Cannot read properties of null/.test(e)),
    'the null-name crash is back',
  ).toHaveLength(0);
});

/**
 * A deployment's POI detail, which 400'd for every deployment on the site.
 *
 * `/api/poi?deployment=` normalised its argument by lowercasing, and base58 is case-sensitive, so
 * every `Qm…` CID became rubbish. The page returned 200 and rendered its shell, the request failed
 * in the console, and nothing else noticed: the #114 shape again, in a route no test opened.
 * nightswatchhq/kittiwake#124.
 */
test('a POI deployment page renders epochs rather than a failed read', async ({ page, request }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/poi')) failed.push(`${r.status()} ${r.url()}`);
  });

  // The subject comes from the API, not from scraping the index. Which deployments have POIs
  // changes, so hardcoding one is a test that rots; and the index renders its links inside a panel
  // Playwright reads as hidden, so locating one there tests the index's layout rather than this
  // page. What is under test is the detail route.
  const index = await request.get('/api/poi');
  expect(index.ok(), `/api/poi returned ${index.status()}`).toBe(true);
  const body = await index.json();
  const list = body.data ?? body;
  const deployments = Array.isArray(list) ? list : (list.deployments ?? []);
  expect(deployments.length, '/api/poi lists no deployments').toBeGreaterThan(0);

  await page.goto(`/poi/${deployments[0].ipfsHash}`);

  // **The request, not the rendering, is what this pins.** The bug was the route refusing a CID,
  // and the page's honest response to a refused read is to say so - so accepting "unavailable" as
  // a pass makes the test agree with the bug. Worse, the first draft checked the rendering first
  // and the failures second, and a page that answers instantly with "unavailable" satisfied it
  // before the 400 had even landed. It passed against a deliberately broken URL.
  //
  // So: settle, then assert nothing was refused.
  await page.waitForLoadState('networkidle').catch(() => {
    // A hung page is itself the symptom: a refused CID leaves the query retrying and networkidle
    // never arrives. Swallowed so the assertions below report it rather than a timeout stack.
  });
  await page.waitForTimeout(1500);
  expect(failed, `the POI detail read was refused: ${failed.join(', ')}`).toHaveLength(0);

  const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  expect(
    /Something went wrong|Application error/i.test(text),
    'the POI detail page rendered an error boundary',
  ).toBe(false);
  expect(
    /POI Analysis|Total Allocations|Unique Indexers/i.test(text),
    `the POI detail page rendered no figures: ${text.slice(0, 200)}`,
  ).toBe(true);
});

// Widened from six to sixteen after a sweep of all forty pages on 2026-09-12 found two routes
// broken in production that nothing here opened. This is the floor - up, no boundary, no console
// errors, some content - and it is deliberately not a data assertion: the tests above carry those
// for the pages where a specific figure is the point.
for (const path of [
  '/curators', '/delegators', '/subgraphs', '/payments', '/grt-flow', '/indexing',
  '/activity', '/calculator', '/curate', '/data-services', '/foghorn', '/poi',
  '/qos', '/sql', '/support', '/verify',
]) {
  test(`${path} renders without an error boundary`, async ({ page }) => {
    const errors = trackErrors(page);
    const res = await page.goto(path);
    expect(res?.status(), `${path} HTTP status`).toBeLessThan(400);
    const body = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    expect(
      /Application error|Something went wrong|Unhandled Runtime Error|500 -/i.test(body),
      `${path} rendered an error boundary`,
    ).toBe(false);
    // A page that renders a nav and nothing else is a failure worth seeing.
    expect(body.length, `${path} rendered almost no content`).toBeGreaterThan(400);
    expect(errors, `console errors on ${path}: ${errors.join(' | ')}`).toHaveLength(0);
  });
}
