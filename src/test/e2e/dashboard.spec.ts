import { test } from '@playwright/test'

// Eventual flow:
//   1. register a new user (creates org + owner membership)
//   2. log in
//   3. land on /dashboard, see the seeded project card
//   4. click into project, see editor shell with empty canvas + populated panels
test.fixme('register → login → dashboard → editor end-to-end', async ({ page }) => {
  await page.goto('/register')
  // Implementation deferred until Track B + E reconcile and DB is seeded.
})
