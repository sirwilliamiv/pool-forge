import { expect, test } from '@playwright/test'

// One run through the job the product exists to do: make a project, draw a pool,
// put things in it, read the numbers back, and check it.
//
// This layer was missing, and its absence is why almost every defect found in
// this codebase was found by a person rather than by a test. The unit suite
// covers each half of every seam and the seams are where things break: a
// command registered but unwired, a handler that runs and reports nothing
// useful, a panel showing five rows all called "Stencil". Each of those passed
// every test that existed and failed the moment somebody used the app.
//
// So the assertions here are deliberately about what a builder would see on
// screen, not about internal state. A test that read the store would have been
// green through every one of those bugs.

const DEMO = { email: 'demo@poolforge.test', password: 'demo1234' }

/** Unique per run, so parallel runs and leftover rows cannot collide. */
const RUN = Math.random().toString(36).slice(2, 8)

// One page, one session, start to finish. An earlier version split this into
// eight tests sharing a server and re-authenticating in each; that spent most of
// its time logging in and failed on the login rather than on the product. A
// journey is one journey.

test('a builder makes a project, draws a pool, and gets a price', async ({ page }) => {
  test.setTimeout(300_000)

  // ---- sign in ----
  await page.goto('/login')
  await page.locator('#email').fill(DEMO.email)
  await page.locator('#password').fill(DEMO.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard/, { timeout: 60_000 })

  // ---- create a project ----
  const name = `E2E ${RUN}`
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()

  // Creation lands on the project page, where the name is the header's
  // inline-editable input rather than page text. Reading it back is the claim
  // that the project exists with the typed name, not just that create said ok.
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })
  await expect(page.getByLabel('Project name')).toHaveValue(name, { timeout: 60_000 })
  const projectUrl = new URL(page.url()).pathname

  // ---- the form saves without pressing Save ----
  // A new project with no site address opens in the focused address state
  // (address-first); Skip for now expands the full page.
  await page.getByRole('button', { name: /skip for now/i }).click()
  // Typing and navigating away used to lose the value, which reads as the save
  // being broken when it was never asked to run.
  const salesperson = page.locator('div:has(> label:text-is("Salesperson")) input').first()
  await salesperson.fill(`Ray ${RUN}`)
  await expect(page.getByText(/^Saved$/)).toBeVisible({ timeout: 30_000 })
  await page.reload()
  // The skip is remembered per project, so the reload comes back to the full
  // page rather than the address card, and the saved value is there to read.
  await expect(
    page.locator('div:has(> label:text-is("Salesperson")) input').first(),
  ).toHaveValue(`Ray ${RUN}`, { timeout: 30_000 })

  // ---- draw a pool ----
  await page.goto(`${projectUrl}/editor`)
  // The 3D route compiles on demand the first time, and it is heavy.
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })

  await addStencil(page, 'Standard rectangle')

  // Named, not "Stencil". Five identical rows made the layers panel useless for
  // finding anything, and it passed every test that existed at the time.
  const panel = page.locator('aside').first()
  await expect(panel.getByText(/rectangle/i).first()).toBeVisible({ timeout: 30_000 })
  // A size, which is the evidence the shape is real rather than just a row.
  await expect(panel.getByText(/\d+' × \d+"?/).first()).toBeVisible({ timeout: 30_000 })

  // ---- add a feature, and prove it reached the database ----
  await addStencil(page, 'Sun shelf')
  // Autosave is debounced, so the reload is the assertion: it proves the drawing
  // was persisted rather than only held in the store.
  await page.waitForTimeout(4_000)
  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })
  await expect(page.locator('aside').first().getByText(/sun shelf/i).first()).toBeVisible({
    timeout: 60_000,
  })

  // ---- it prices ----
  // A quote still at zero after a pool is drawn means the measurement never
  // reached the pricing engine, which is the failure worth catching here.
  const money = page.getByText(/\$[\d,]+/).first()
  await expect(money).toBeVisible({ timeout: 60_000 })
  const amount = Number(((await money.textContent()) ?? '').replace(/[^0-9.]/g, ''))
  expect(amount, 'a drawn pool must produce a non-zero quote').toBeGreaterThan(0)

  // ---- the proposal opens for the project that was built ----
  await page.goto(`${projectUrl}/proposal`)
  await expect(page.getByText(new RegExp(name, 'i')).first()).toBeVisible({ timeout: 90_000 })
})

/**
 * Add a stencil from the panel.
 *
 * A click, not a drag: `ToolGestures` abandons placement once the pointer moves
 * more than four pixels, so a drag orbits the camera and creates nothing,
 * silently. That is why this is a helper with a comment rather than an inline
 * `dragTo`.
 */
async function addStencil(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /stencils/i }).first().click()
  await page.getByPlaceholder(/search stencils/i).fill(name)
  await page.getByText(name, { exact: false }).first().click()
  await page.waitForTimeout(1_500)
  await page.getByRole('button', { name: /layers/i }).first().click()
}
