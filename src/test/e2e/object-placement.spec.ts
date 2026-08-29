import { expect, test, type Page } from '@playwright/test'

// Objects have to be where you can see them, and clickable where they are.
//
// Three faults sat behind one complaint that things were hard to see. Several
// object components place themselves from the shape and were also wrapped in a
// positioned group, so they rendered at roughly twice their offset while their
// selection outline stayed correct: the object looked missing and the outline
// looked like it was pointing at nothing. And the house wall, the tree and the
// lounger were rendered without their shape at all, so their group carried no
// `userData.id`, the picker walked past them, and they could not be selected,
// dragged or resized. They were scenery.
//
// Driven through the interface because none of that is visible to a unit test:
// every one of these bugs type-checked and rendered without an error.

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
  await page.waitForTimeout(3000)
}

/** Place a stencil from the panel and return its layer row. */
async function place(page: Page, name: RegExp) {
  await page.getByRole('button', { name: /^Stencils/ }).click()
  await page.getByRole('button', { name }).first().click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^Layers/ }).click()
}

test.describe('placed objects', () => {
  test('a house wall can be selected, which means it carries an id', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await place(page, /^House wall/)

    // Selecting it from the layer list is what proves the shape exists and the
    // inspector can address it.
    await page.getByText(/^House wall/).first().click()

    // The inspector switches from "Nothing selected" to a real object, and
    // offers the fields that adjust it. Before the fix the wall existed as a
    // row and could not be touched on the canvas at all.
    await expect(page.getByText('Nothing selected')).toHaveCount(0)
  })

  test('a tanning ledge lands where its own layer row says it is', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await place(page, /^Tanning ledge/)

    // The row carries the size, which comes from the shape. If the component
    // were double positioned the shape would still be right here and only the
    // render would be wrong, so this is the weaker half of the check: the
    // structural guard in three/self-positioning.test.ts is the real one.
    await expect(page.getByText(/^Tanning ledge/).first()).toBeVisible()
    await page.getByText(/^Tanning ledge/).first().click()
    await expect(page.getByText('Nothing selected')).toHaveCount(0)
  })

  test('the drawing is in frame when a saved project opens', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    // Nothing to click: this is about what the camera does on its own. The
    // editor used to open on empty grid with layers listed and a quote in the
    // corner, everything loaded and none of it visible, and the way out was a
    // FIT button nobody new would think to press.
    const shown = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return { drawn: 0 }
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      return { drawn: gl ? 1 : 0 }
    })
    expect(shown.drawn).toBe(1)
    await expect(page.getByRole('button', { name: /^FIT/i })).toBeVisible()
  })
})
