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
    env: {
      // Invite and password links are built from this. Without it they point at
      // the default origin, and a test that follows one would leave the server
      // under test entirely and report a dead link as a broken invite.
      APP_URL: 'http://localhost:3100',
      // The port the suite runs on, said twice, because next-auth redirects to
      // AUTH_URL after a successful sign-in and inherits it from `.env.local`
      // otherwise. That points at whatever port the developer's own dev server
      // uses, so every signing-in test fails with a connection refused the
      // moment that server is not running: a suite that passes or fails
      // depending on an unrelated process.
      AUTH_URL: 'http://localhost:3100',
      // Deliberately blank. Identity Platform is proved against the real service
      // by an end-to-end run; this suite must pass on any machine, with no
      // credential and no network, so it exercises the local-password path that
      // an unconfigured deployment uses.
      IDENTITY_PLATFORM_API_KEY: '',
    },
  },
})
