import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'src/test/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // A port of its own. This used to be 3000 with `reuseExistingServer`, and an
    // unrelated app happened to be listening there: Playwright reused it and
    // tested somebody else's server, reporting "Cannot GET /login" as a missing
    // email field.
    baseURL: 'http://localhost:3100',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'cross-env PORT=3100 NEXT_DIST_DIR=.next-e2e next dev',
    port: 3100,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
