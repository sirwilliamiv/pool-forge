import { defineConfig, devices } from '@playwright/test'

/**
 * Recorded product demos.
 *
 * Separate from `playwright.config.ts` because the goals conflict: the test
 * config wants speed and no artifacts, this one wants video, a slow enough
 * cadence to follow, and a viewport that matches a real desktop.
 *
 * Each chapter is one test, so Playwright writes one video per chapter rather
 * than a single unscrubabble recording of everything. They double as end-to-end
 * coverage: `docs/build-priority.md` T18 notes that nothing currently tests
 * drawing through to a quote and a document.
 *
 *   pnpm demo            record every chapter
 *   pnpm demo 03-pool    record one
 */
const PORT = process.env.DEMO_PORT ?? '3001'

export default defineConfig({
  testDir: 'src/test/e2e/demo',
  outputDir: 'demo-output',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A chapter walks a lot of UI at a deliberately slow cadence.
  // Five minutes: long enough for the slowest chapter, short enough that a
  // stuck overlay costs five minutes of wall clock instead of ten.
  timeout: 5 * 60_000,
  reporter: [['list']],
  // A click that never lands should fail in seconds, not hang the chapter.
  expect: { timeout: 15_000 },
  use: {
    actionTimeout: 20_000,
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1600, height: 1000 },
    video: { mode: 'on', size: { width: 1600, height: 1000 } },
    trace: 'off',
    screenshot: 'off',
    // Slow enough to follow on screen without being tedious.
    launchOptions: { slowMo: Number(process.env.DEMO_SLOWMO ?? 220) },
  },
  projects: [
    {
      name: 'demo',
      // Viewport after the device spread: `devices['Desktop Chrome']` pins
      // 1280x720, which overrode the top-level viewport and made every
      // recording a small page padded inside a large frame.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } },
    },
  ],
  // Deliberately no `webServer`: these run against the dev server already up on
  // DEMO_PORT, so a recording never races a cold Next.js compile.
})
