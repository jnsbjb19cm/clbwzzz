import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: [
    '**/pvp-projectile-continuity-20260819.spec.mjs',
    '**/pvp-projectile-cadence-20260819.spec.mjs',
    '**/pvp-projectile-onset-event-20260819.spec.mjs',
  ],
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['line']],
  outputDir: 'test-results-projectile',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1600, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    storageState: {
      cookies: [],
      origins: [{
        origin: 'http://127.0.0.1:4173',
        localStorage: [
          { name: 'clbwz_auth_token_v1', value: 'playwright-local-ui-token' },
        ],
      }],
    },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});