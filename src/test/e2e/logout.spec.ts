import { expect, test, type Page } from '@playwright/test'

// Logging out, proved by clicking it.
//
// This exists because the button was wired up correctly and did nothing. It sat
// inside a Radix menu item, which closes the menu on `pointerup` and unmounts
// the portal holding the form, so the browser had no form left to submit
// against by the time `click` was dispatched. Nothing threw, the markup read
// fine, and every test that reached the action directly passed.
//
// So the assertions below are deliberately made through the interface: open the
// menu the way a person does, press the item the way a person does, and then
// prove the session is gone rather than that a redirect happened. Synthetic
// events would resurrect the bug, since dispatching click straight at the
// button is exactly what the broken version handled correctly.

const DEMO_EMAIL = 'demo@poolforge.test'
const DEMO_PASSWORD = 'demo1234'

async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(DEMO_EMAIL)
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
}

test.describe('logging out', () => {
  test('the account menu logs the user out and ends the session', async ({ page }) => {
    await signInAsDemo(page)

    await page.getByRole('button', { name: DEMO_EMAIL }).click()
    const logOut = page.getByRole('menuitem', { name: /log out/i })
    await expect(logOut).toBeVisible()
    await logOut.click()

    await page.waitForURL(/\/login/, { timeout: 60_000 })

    // The redirect alone would also happen if the cookie survived, so ask for a
    // protected page and require the app to refuse it.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByLabel(/password/i)).toBeVisible()
  })
})
