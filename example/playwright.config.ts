// Browser tests for the example's web build (npm run web:e2e): see web-e2e/.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'web-e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:8090',
    // A phone-sized window, like the native e2e
    ...devices['Desktop Chrome'],
    // PLAYWRIGHT_CHANNEL=chrome uses an installed Google Chrome instead of Playwright's own Chromium (CI does:
    // its runners have Chrome, so there's nothing to download)
    channel: process.env.PLAYWRIGHT_CHANNEL,
    viewport: { width: 400, height: 860 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-web.mjs 8090',
    url: 'http://localhost:8090',
    reuseExistingServer: !process.env.CI,
  },
});
