// web/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PW_SERVER_CMD = process.env.PW_SERVER_CMD || 'pnpm -w --filter web start';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.spec\.ts$/,
  fullyParallel: true,
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: PW_SERVER_CMD,         // Playwright will start your app
    url: BASE_URL,                  // and wait until it's reachable
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  reporter: [['github'], ['html', { open: 'never' }]],
});
