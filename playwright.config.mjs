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
    // Reusing an installed system browser avoids a browser download in local
    // sandboxes; disable video there because Playwright's separate ffmpeg bundle
    // is intentionally absent.
    video: systemBrowserExecutable ? 'off' : 'retain-on-failure',
    /*
     * ef577a2 已启用登录门。浏览器回归测试只验证本地 UI/战斗表现，
     * 不启动 Node/SQLite 后端，因此预置测试 token；App.restore 即使收到
     * preview 的 404，也会继续 bootstrap，从而使用真实主城与战斗入口。
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
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
