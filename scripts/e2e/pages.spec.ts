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
    if (m.type() === 'error') errors.push(`console.error: ${m.text().slice(0, 200)}`);
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

  const body = (await page.locator('main').innerText()).replace(/\s+/g, ' ');

  // #114: every one of 80 rows rendered "Oracle read unavailable" while the API reported
  // reoStatus "eligible" on 100 of 100.
  expect(
    body.includes('Oracle read unavailable'),
    'every indexer reports "Oracle read unavailable" - the enriched payload is not reaching the table (#114)',
  ).toBe(false);

  // At least one row must carry a real APR percentage. A directory of dashes is the outage.
  expect(
    /\d+\.\d+%/.test(body),
    'no indexer shows a numeric APR or cut - the table is rendering its fallback path (#114)',
  ).toBe(true);
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

for (const path of ['/curators', '/delegators', '/subgraphs', '/payments', '/grt-flow', '/indexing']) {
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
