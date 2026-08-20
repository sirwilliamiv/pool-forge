import { test } from '@playwright/test'

import { login, warmEditorRoute } from './_demo'

/**
 * Not a chapter. Compiles the editor route once so the recorded chapters do not
 * open on a blank viewport waiting for a dev-mode build. Named 00 so it runs
 * first under the serial worker.
 */
test('warmup (not a chapter)', async ({ page }) => {
  await login(page)
  await warmEditorRoute(page)
})
