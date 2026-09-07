import { defineConfig } from '@playwright/test';

const systemBrowserExecutable = process.env.CLBWZ_PLAYWRIGHT_EXECUTABLE;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  timeout: 30_000,
  expect: {
    timeout: 8_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['line'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: systemBrowserExecutable
      ? { executablePath: systemBrowserExecutable }
      : undefined,
    viewport: { width: 1920, height: 1080 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: systemBrowserExecutable ? 'off' : 'retain-on-failure',
    /*
     * Browser regressions exercise source-level UI seams (some tests import
     * /src modules from inside the page), so the Playwright server must be Vite
     * dev rather than `vite preview`. Production bundling is verified separately
     * by `npm run build:deploy` in Browser Smoke/CI.
     */
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4173',
          localStorage: [
            { name: 'clbwz_auth_token_v1', value: 'playwright-local-ui-token' },
          ],
        },
      ],
    },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
