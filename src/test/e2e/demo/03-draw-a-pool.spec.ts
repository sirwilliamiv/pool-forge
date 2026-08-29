import { expect, test } from '@playwright/test'

import {
  BEAT,
  chapter,
  clickOnCanvas,
  dismissOverlays,
  dragOnCanvas,
  login,
  note,
  openEditor,
  pickPoolShape,
  say,
  tool,
} from './_demo'

const NAME = '03-draw-a-pool'

test('Chapter 3 — Draw a pool', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 3',
    'Draw a pool',
    'A new project, then the shape everything else hangs off.',
  )

  await say(page, 'Start a project', 'A customer name and a project name is all it takes.')
  await page.click('button:has-text("New project")')
  await page.waitForTimeout(900)

  const projectName = `Demo — Whitfield backyard`
  await page.fill('input[name="name"]', projectName).catch(() => note(NAME, 'no name field in the create dialog'))
  await page.fill('input[name="customerName"]', 'Sarah Whitfield').catch(() => {})
  await page.waitForTimeout(600)
  await page.click('button:has-text("Create")')
  // Wait for the dialog to actually go before reading links or navigating: the
  // app may route itself, and racing that produced a permanently blank editor.
  await page.waitForTimeout(2500)
  await dismissOverlays(page)
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle').catch(() => {})

  const href = await page.locator('a[href*="/projects/"]').first().getAttribute('href')
  if (!href) {
    note(NAME, 'project was created but no project link appeared on the dashboard')
    return
  }

  await say(page, 'Open the editor', 'One 3D scene. The plan view is the same scene under an orthographic camera, not a second drawing.')
  await openEditor(page, href)

  await say(page, 'The pool tool', 'Keyboard R. It opens a shape family menu.')
  await say(page, 'Pick a family first', 'The tool only arms once a shape is chosen, then the next click on the canvas places it.')
  const picked = await pickPoolShape(page, 'Rectangle')
  if (!picked) note(NAME, 'pool shape picker did not activate the tool')

  await say(page, 'Click to place it', 'A click drops the pool; dragging the canvas orbits the camera instead.')
  await clickOnCanvas(page, { x: 0.46, y: 0.48 })
  await say(page, 'Size it on the right', 'Dimensions are numeric fields in the inspector, so a pool is exact rather than eyeballed.')

  const layers = page.locator('text=/LAYERS/i').first()
  if ((await layers.count()) > 0) {
    await say(page, 'It lands as a layer', 'Every object is listed, selectable, and nameable on the left.')
  }

  await say(page, 'Select it', 'The right panel is where a selected object is measured and priced.')
  await clickOnCanvas(page, { x: 0.48, y: 0.49 })

  const computed = page.locator('text=/SURFACE AREA/i').first()
  if ((await computed.count()) === 0) {
    note(NAME, 'no computed measurements panel visible after selecting the pool')
  } else {
    await say(page, 'Measurements are derived, never typed', 'Surface area, perimeter, volume and wetted area recompute on every change.')
    await page.waitForTimeout(BEAT)
  }

  await say(page, 'Camera presets', 'Top, left, iso, right, front. The same scene from any angle.')
  for (const view of ['top', 'iso', 'front']) {
    const btn = page.locator(`[aria-label="Snap camera to ${view} view"]`).first()
    if ((await btn.count()) === 0) {
      note(NAME, `camera preset "${view}" is missing`)
      continue
    }
    await btn.click()
    await page.waitForTimeout(1100)
  }

  await expect(page.locator('canvas').first()).toBeVisible()
  await say(page, 'Next: build it out', 'Steps, a spa, water features, lights and the deck around it.')
})
