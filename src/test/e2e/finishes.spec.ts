import { expect, test, type Page } from '@playwright/test'

// Picking a finish, which is where the upsell lives and the thing a customer
// changes three times during a sit-down.
//
// Every part of this used to be theatre. The inspector's selected value was
// component state, so it snapped back to the top of the list on reload. The
// price beside each name came from the material row rather than the price book,
// so the panel said `Travertine — Ivory $28.00/lf` while the quote billed
// $42.00/lf. And the interior list was built from every material whose kind was
// CUSTOM, which put a $15.00-per-linear-foot waterline tile in the list of
// finishes billed by the square foot.
//
// The assertions below are all things a builder sees on screen, because every
// one of those defects passed the unit suite.

const DEMO = { email: 'demo@poolforge.test', password: 'demo1234' }
const RUN = Math.random().toString(36).slice(2, 8)

test('a builder picks an interior finish, and it survives, prices and prints', async ({ page }) => {
  test.setTimeout(300_000)

  await page.goto('/login')
  await page.locator('#email').fill(DEMO.email)
  await page.locator('#password').fill(DEMO.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard/, { timeout: 60_000 })

  const name = `Finish ${RUN}`
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
  // Creation lands on the project page; the name is the header inline input.
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })
  await expect(page.getByLabel('Project name')).toHaveValue(name, { timeout: 60_000 })
  const projectUrl = new URL(page.url()).pathname

  await page.goto(`${projectUrl}/editor`)
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })

  // A click, not a drag: ToolGestures abandons placement past four pixels.
  await page.getByRole('button', { name: /stencils/i }).first().click()
  await page.getByPlaceholder(/search stencils/i).fill('Standard rectangle')
  await page.getByText('Standard rectangle', { exact: false }).first().click()
  await page.waitForTimeout(2_000)

  await selectPool(page)

  // ---- the default is a finish, not the colour of the water ----
  const interior = row(page, 'Interior finish')
  await expect(interior).toBeVisible({ timeout: 30_000 })
  await expect(interior).not.toContainText('Pool Water')

  // ---- the price shown is a price the quote bills ----
  // The row prints the price-book item's own name under the material, so the
  // line it will produce on the quote is nameable before it is produced.
  const shown = await priceOf(page, 'Interior finish')
  expect(shown, 'the finish row must show a price').toMatch(/^\$[\d,.]+\/sqft$/)

  const before = await liveQuote(page)

  // ---- the list offers finishes for this slot, in this slot's unit ----
  await openMenu(page, 'Interior finish')
  const options = await page.locator('[role="menu"]').first().innerText()
  expect(options, 'a per-linear-foot tile band is not an interior finish').not.toMatch(/\/lf/)
  expect(options).not.toMatch(/Pool Water/)
  expect(options).toMatch(/PebbleTec — Cobalt/)

  await page.locator('[role="menu"]').first().getByText(/PebbleTec — Cobalt/).first().click()
  await page.waitForTimeout(5_000)

  // ---- it reaches the quote ----
  const after = await liveQuote(page)
  expect(after, 'changing the finish must move the price').toBeGreaterThan(before)
  await expect(row(page, 'Interior finish')).toContainText('PebbleTec — Cobalt')

  // ---- it survives a reload ----
  // The reload is the assertion: the choice has to be in the database, not only
  // in a component that is about to be thrown away.
  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })
  await selectPool(page)
  await expect(row(page, 'Interior finish')).toContainText('PebbleTec — Cobalt', {
    timeout: 30_000,
  })
  expect(await liveQuote(page)).toBe(after)

  // ---- it prints ----
  await page.goto(`${projectUrl}/proposal`)
  await expect(page.getByText('PebbleTec — Cobalt').first()).toBeVisible({ timeout: 90_000 })

  await page.goto(`${projectUrl}/construction`)
  await expect(page.getByText(/PebbleTec — Cobalt/).first()).toBeVisible({ timeout: 90_000 })
})

/** The inspector section for one finish slot. */
function row(page: Page, label: string) {
  return page.locator('aside').last().locator('section', { hasText: label }).first()
}

async function openMenu(page: Page, label: string): Promise<void> {
  await row(page, label).locator('button[aria-haspopup="menu"]').first().click()
  await page.waitForTimeout(500)
}

async function priceOf(page: Page, label: string): Promise<string> {
  const text = await row(page, label).innerText()
  return (text.split('\n').pop() ?? '').trim()
}

/** Click the pool on the canvas. The layers panel is a different surface. */
async function selectPool(page: Page): Promise<void> {
  await page.waitForTimeout(3_000)
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(1_500)
}

async function liveQuote(page: Page): Promise<number> {
  const text = await page.getByText(/^\$[\d,]+$/).first().innerText()
  return Number(text.replace(/[^0-9.]/g, ''))
}
