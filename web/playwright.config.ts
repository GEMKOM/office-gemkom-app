import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the assembled site (<repo>/_site), served the way GitHub
// Pages serves it. `npm run test:e2e` builds and assembles first; on its own,
// `npx playwright test` tests whatever is in _site already.
//
// The page origin must be localhost/127.0.0.1: base.js then points the app at
// http://127.0.0.1:8001, which the tests intercept (e2e/fixtures.ts). No real
// backend is needed or contacted.
const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : 1,
  reporter: CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    // The installed Google Chrome; no Playwright browser download needed.
    channel: 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: `npm run serve:site -- --port ${PORT}`,
    url: `${BASE_URL}/`,
    reuseExistingServer: !CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
