import { expect, test } from '@playwright/test'

// What a builder sees when they type the domain.
//
// For a long time the answer was a password field. The page that explains what
// Pool Forge is existed and nothing linked to it, so the front door asked people
// to sign in to something nobody had told them about.

test.describe('the front door', () => {
  test('a signed-out visitor lands on the marketing page, not a sign-in box', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/request-access/)
    // The claim the page is built around, and the thing a builder is here for.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/invite only while it is early/i)).toBeVisible()
  })

  test('the sign-in page is still reachable for people who have an account', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })

  test('a signed-in builder is taken to the work rather than the pitch', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill('demo@poolforge.test')
    await page.getByLabel(/password/i).fill('demo1234')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 60_000 })

    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
