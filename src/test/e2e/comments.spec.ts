import { expect, test } from '@playwright/test'

// Leaving a note on a drawing, the way a builder does.
//
// The Comment tool shipped as a toolbar button, a keyboard shortcut and a
// `console.info` that swallowed the click. Every unit test around it was green,
// because each half worked: the tool activated, and the canvas received the
// click. So this drives the real thing end to end — drop it, type it, reload
// it, resolve it — and then opens the customer proposal to check the note is
// not on it, which is the one thing about this feature that must never be
// wrong.

const DEMO = { email: 'demo@poolforge.test', password: 'demo1234' }

const RUN = Math.random().toString(36).slice(2, 8)
const NOTE = `Check the gas line clearance ${RUN}`

test('a builder leaves a note, it survives a reload, and no customer ever sees it', async ({
  page,
}) => {
  test.setTimeout(300_000)

  // ---- sign in ----
  await page.goto('/login')
  await page.locator('#email').fill(DEMO.email)
  await page.locator('#password').fill(DEMO.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard/, { timeout: 60_000 })

  // ---- a project of its own ----
  const name = `Notes ${RUN}`
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
  // Creation lands on the project page; the name is the header inline input.
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })
  await expect(page.getByLabel('Project name')).toHaveValue(name, { timeout: 60_000 })
  const projectUrl = new URL(page.url()).pathname

  await page.goto(`${projectUrl}/editor`)
  const canvas = page.locator('canvas').first()
  // The 3D route compiles on demand the first time, and it is heavy.
  await expect(canvas).toBeVisible({ timeout: 180_000 })
  await page.waitForTimeout(2_000)

  // ---- escape leaves nothing behind ----
  // An empty pin would be worse than no pin: somebody would have to open it to
  // find out it says nothing.
  await page.getByRole('button', { name: /^comment/i }).first().click()
  await canvas.click({ position: { x: 380, y: 300 } })
  await expect(page.getByRole('dialog', { name: /new note/i })).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /new note/i })).toBeHidden()
  await expect(page.getByRole('button', { name: /^note from/i })).toHaveCount(0)

  // ---- drop a note ----
  await page.getByRole('button', { name: /^comment/i }).first().click()
  await canvas.click({ position: { x: 420, y: 320 } })
  const composer = page.getByRole('dialog', { name: /new note/i })
  await expect(composer).toBeVisible({ timeout: 15_000 })
  await composer.getByLabel('Note').fill(NOTE)
  await composer.getByRole('button', { name: /^save$/i }).click()

  // A pin on the canvas, and the note itself readable.
  const pin = page.getByRole('button', { name: /^note from/i }).first()
  await expect(pin).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(NOTE).first()).toBeVisible({ timeout: 15_000 })

  // ---- it is in the database, not just in the tab ----
  // Autosave is debounced, so the reload is the assertion.
  await page.waitForTimeout(4_000)
  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })
  await expect(page.getByRole('button', { name: /^note from/i }).first()).toBeVisible({
    timeout: 60_000,
  })

  // ---- findable without hunting the canvas ----
  await page.getByRole('button', { name: /^notes/i }).first().click()
  await expect(page.getByText(NOTE).first()).toBeVisible({ timeout: 15_000 })

  // ---- resolve it ----
  await page.getByRole('button', { name: /resolve note/i }).first().click()
  await expect(page.getByRole('button', { name: /reopen note/i }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText(/0 open · 1 resolved/i)).toBeVisible({ timeout: 15_000 })

  // Resolved is a state of the note, not a delete: it has to survive too.
  await page.waitForTimeout(4_000)
  await page.reload()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })
  await page.getByRole('button', { name: /^notes/i }).first().click()
  await expect(page.getByRole('button', { name: /reopen note/i }).first()).toBeVisible({
    timeout: 60_000,
  })

  // ---- and none of it reaches the customer ----
  await page.goto(`${projectUrl}/proposal`)
  await expect(page.getByText(new RegExp(name, 'i')).first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(NOTE)).toHaveCount(0)
  expect(await page.content()).not.toContain(NOTE)
})
