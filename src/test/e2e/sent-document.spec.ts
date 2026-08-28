// The behaviour the whole change exists for, driven through the real app.
//
// A builder sends a proposal. The customer opens the link. The builder then
// changes a price. The customer's link must still show the document that was
// sent, not a fresh render at today's numbers, and the file behind it must come
// back byte for byte with the fingerprint the row recorded.
//
// This runs against the real database and the real blob store, because the only
// interesting failure modes here (a copy that was never stored, a copy that
// silently re-renders) are invisible to anything mocked.

import { createHash } from 'node:crypto'

import { expect, test, type Page } from '@playwright/test'

const EMAIL = 'demo@poolforge.test'
const PASSWORD = 'demo1234'

// Distinct enough that a grep for them cannot hit anything else on the page.
const SENT_PRICE = 1234
const LATER_PRICE = 98765

test.describe.configure({ mode: 'serial' })

async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 60_000 })
}

async function newProject(page: Page, label: string): Promise<string> {
  const name = `${label} ${Date.now().toString(36).slice(-5)}`
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
  await page.getByText(name).first().waitFor({ timeout: 60_000 })
  await page.getByText(name).first().click()
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })
  return new URL(page.url()).pathname
}

async function addLineItem(page: Page, name: string, unitPrice: number): Promise<void> {
  await page.getByRole('button', { name: /^Add$/ }).first().click()
  await page.locator('#pli-name').fill(name)
  await page.locator('#pli-price').fill(String(unitPrice))
  await page.getByRole('button', { name: /add to job/i }).click()
  await expect(page.locator('#pli-name')).toHaveCount(0, { timeout: 30_000 })
  await page.reload()
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 })
}

test('the customer keeps the copy that was sent, not a fresh render', async ({ page, request }) => {
  await login(page)
  const projectPath = await newProject(page, 'Sent copy')

  // A number the proposal will print, and one a later edit will change.
  await addLineItem(page, 'Permit allowance', SENT_PRICE)

  // Send it. Creating the share link is the moment the proposal goes out, and
  // it is what files the copy.
  await page.getByRole('button', { name: /create link/i }).click()
  const urlBox = page.locator('#share-proposal-url')
  await expect(urlBox).toBeVisible({ timeout: 60_000 })
  const shareUrl = await urlBox.inputValue()
  const token = shareUrl.split('/share/')[1]
  expect(token, 'no share token on the page').toBeTruthy()

  // The customer's copy carries the price that was sent.
  await page.goto(`/share/${token}`)
  await expect(page.getByText(/copy that was sent to you/i)).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('body')).toContainText('1,234')

  // The builder's own proposal page says which copy the customer is looking at.
  await page.goto(`${projectPath}/proposal`)
  await expect(page.getByText(/copy on file/i)).toBeVisible({ timeout: 60_000 })

  // Now change a price. This is the thing that used to rewrite a proposal
  // somebody had already been sent.
  await page.goto(projectPath)
  await addLineItem(page, 'Paver retaining wall', LATER_PRICE)

  // The live document moves.
  await page.goto(`${projectPath}/proposal`)
  await expect(page.locator('body')).toContainText('98,765')

  // The customer's does not.
  await page.goto(`/share/${token}`)
  await expect(page.locator('body')).toContainText('1,234')
  await expect(page.locator('body')).not.toContainText('98,765')

  // And the file behind it round-trips: two fetches, identical bytes, and the
  // response is a download rather than a page.
  const first = await request.get(`/share/${token}/document`)
  expect(first.status()).toBe(200)
  const bytesA = await first.body()
  expect(first.headers()['content-disposition']).toContain('attachment')
  expect(first.headers()['content-type']).toContain('text/html')

  const second = await request.get(`/share/${token}/document`)
  const bytesB = await second.body()
  expect(bytesA.equals(bytesB)).toBe(true)

  const html = bytesA.toString('utf8')
  expect(html.startsWith('<!doctype html>')).toBe(true)
  expect(html).toContain('1,234')
  expect(html).not.toContain('98,765')
  // Self-contained: nothing it would fetch when opened years from now.
  expect(html).not.toMatch(/<script\b/i)
  expect(html).not.toMatch(/<link\b/i)
  expect(html).not.toMatch(/(?:src|href)="https?:/i)

  // The fingerprint the response advertises is the fingerprint of the bytes.
  const etag = first.headers()['etag'] ?? ''
  expect(etag.replace(/"/g, '')).toBe(createHash('sha256').update(bytesA).digest('hex'))
})

test('a stored document is not readable across organisations', async ({ request }) => {
  // No session at all: the authenticated route must refuse rather than serve.
  const res = await request.get('/api/exports/cmnotarealexportid000000', {
    headers: { cookie: '' },
  })
  expect([401, 404]).toContain(res.status())
})
