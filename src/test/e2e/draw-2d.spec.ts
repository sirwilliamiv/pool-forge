import { expect, test, type Page } from '@playwright/test'

// Drawing in plan, and turning what was drawn into something priced.
//
// Driven through the interface because that is the only thing that proves it:
// the tools attach their own capture-phase pointer listeners to the canvas, so
// a test that called the commands directly would exercise the handlers and
// none of the gestures that reach them.

const DEMO_EMAIL = 'demo@poolforge.test'
const DEMO_PASSWORD = 'demo1234'

async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(DEMO_EMAIL)
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/projects/seed-project-demo/editor')
  await expect(page.locator('canvas')).toBeVisible({ timeout: 60_000 })
  // The scene needs a frame before the canvas will answer a pointer sensibly.
  await page.waitForTimeout(2500)
}

/** Click a point in the canvas, in fractions of its box. */
/** Arm a drawing tool and let the plan camera settle before clicking. */
async function armTool(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name }).click()
  // Arming switches the view to plan, which swaps the camera. A click landing
  // in the gap would be measured against the camera that just left.
  await page.waitForTimeout(800)
}

async function clickCanvas(page: Page, fx: number, fy: number): Promise<void> {
  const canvas = page.locator('canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no box')
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy)
}

test.describe('drawing in 2D', () => {
  test('the line tool draws a closed outline that becomes a pool', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await armTool(page, /^Line/)

    // A square, ending back where it started so the path closes.
    await clickCanvas(page, 0.35, 0.55)
    await clickCanvas(page, 0.55, 0.55)
    await clickCanvas(page, 0.55, 0.75)
    await clickCanvas(page, 0.35, 0.75)
    await clickCanvas(page, 0.35, 0.55)
    await page.keyboard.press('Enter')

    // The inspector is the proof: a drawn path selects itself, and its section
    // only renders for a sketch.
    await expect(page.getByRole('heading', { name: /Drawn outline/i })).toBeVisible({
      timeout: 15_000,
    })

    // The whole point of the feature: the drawing becomes a real object.
    await page.getByRole('button', { name: /Convert to a 3D pool/i }).click()

    // The sketch is gone, because leaving it would double every measurement
    // taken off the plan, and a pool is selected in its place.
    await expect(page.getByRole('heading', { name: /Drawn outline/i })).toHaveCount(0)
    await expect(page.getByText(/Freeform Pool/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test('an open line refuses to become a pool, and says why', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await armTool(page, /^Line/)
    await clickCanvas(page, 0.3, 0.35)
    await clickCanvas(page, 0.6, 0.35)
    await page.keyboard.press('Enter')

    await expect(page.getByRole('heading', { name: /Drawn line/i })).toBeVisible({ timeout: 15_000 })
    // No convert button at all, and an explanation instead of a dead control.
    await expect(page.getByRole('button', { name: /Convert to a 3D pool/i })).toHaveCount(0)
    await expect(page.getByText(/open line has no inside/i)).toBeVisible()
  })

  // Everybody draws a plan from above. Section is the case that would be
  // actively wrong: that camera looks along the ground plane every click is
  // measured against, so a click either misses it or lands hundreds of feet
  // away depending on a pixel.
  test('arming a drawing tool switches to the plan view, even from section', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await page.getByRole('tab', { name: 'Section' }).click()
    await expect(page.getByRole('tab', { name: 'Section' })).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('button', { name: /^Freehand/ }).click()

    await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true')
  })

  // Finishing has to actually finish. Left armed, the click after a line
  // starts another one and the tool never appears to end.
  test('finishing a line puts the pointer back to Move', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await armTool(page, /^Line/)
    await expect(page.getByRole('button', { name: /^Line/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await clickCanvas(page, 0.35, 0.55)
    await clickCanvas(page, 0.55, 0.55)
    await page.keyboard.press('Enter')

    await expect(page.getByRole('button', { name: /^Move/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: /^Line/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('escape lets go of a drawing tool', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await armTool(page, /^Freehand/)
    await page.keyboard.press('Escape')

    await expect(page.getByRole('button', { name: /^Move/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  test('the grid size control is in the toolbar and changes the grid', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    const grid = page.locator('#grid-spacing')
    await expect(grid).toBeVisible()
    await expect(grid).toHaveValue('foot')
    await grid.selectOption('large')
    await expect(grid).toHaveValue('large')
  })
})
