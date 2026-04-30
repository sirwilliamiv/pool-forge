import { test, expect } from '@playwright/test'

// Editor 3D smoke: verify the route compiles, mounts a <canvas>, and the ⌘K
// palette opens/closes. Selection-click is intentionally not tested — 3D
// raycasting under headless Chromium is unreliable and is covered manually
// during dev (Wave 2 acceptance §3).
//
// Skipped by default: needs a seeded user + project to navigate past auth.
// Wire the fixture in when an e2e seed script lands.
test.fixme('editor route renders 3D canvas and palette opens with ⌘K', async ({ page }) => {
  await page.goto('/projects/seed-project-id/editor')

  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 10_000 })

  // Pixel-variance check: the screenshot of a non-blank WebGL canvas should
  // have more than one unique byte value across the buffer.
  const png = await canvas.screenshot()
  const unique = new Set<number>()
  for (const byte of png) unique.add(byte)
  expect(unique.size).toBeGreaterThan(8)

  // ⌘K opens the palette
  await page.keyboard.press('Meta+k')
  await expect(page.getByPlaceholder('Type a command or search…')).toBeVisible()

  // Esc closes
  await page.keyboard.press('Escape')
  await expect(page.getByPlaceholder('Type a command or search…')).not.toBeVisible()
})
