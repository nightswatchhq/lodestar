import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end against the *deployed* dashboard.
 *
 * There is no dev server here on purpose. These tests exist because #114 was invisible to every
 * check that did not open a browser against production: the API answered 200, `tsc` was happy, and
 * the page rendered a full table of dashes. A suite that boots its own server would have been just
 * as blind, because the payload it read would have been a fixture.
 */
export default defineConfig({
  testDir: './scripts/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 90_000,
  expect: { timeout: 30_000 },
  // Production is a shared thing; do not stampede it.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['json', { outputFile: 'playwright-report.json' }]] : 'list',
  use: {
    baseURL: process.env.LODESTAR_BASE ?? 'https://www.lodestar-dashboard.com',
    userAgent: 'lodestar-e2e/1.0 (+monitoring)',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
