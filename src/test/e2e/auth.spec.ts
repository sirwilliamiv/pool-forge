import { test, expect } from '@playwright/test'

test('login page renders email and password inputs', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByLabel(/password/i)).toBeVisible()
})

test('login page exposes a submit control', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible()
})
