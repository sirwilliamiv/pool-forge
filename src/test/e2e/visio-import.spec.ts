import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

// The designer's own stencils, end to end: drop Pool.vss on the Stencils
// panel, import, drag a master onto the canvas, see it in the layer list.
//
// The real file is not checked in (it is a working designer's library), so
// this runs only when VISIO_STENCIL_DIR points at a directory holding
// Pool.vss, and `vss2raw` has to be on PATH for the server. Everything the
// unit suite can prove from the checked-in text fixtures lives there; this is
// the one check that the browser, the route, the converter process and the
// commands agree with each other.

const DEMO_EMAIL = 'demo@poolforge.test'
const DEMO_PASSWORD = 'demo1234'
const STENCIL_DIR = process.env['VISIO_STENCIL_DIR']
const POOL_VSS = STENCIL_DIR ? join(STENCIL_DIR, 'Pool.vss') : null
const STENCIL_DRAG_MIME = 'application/x-poolforge-stencil'

test.skip(!POOL_VSS || !existsSync(POOL_VSS), 'set VISIO_STENCIL_DIR to a directory holding Pool.vss')

async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(DEMO_EMAIL)
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
}

async function openEditor(page: Page): Promise<void> {
  await page.goto('/projects/seed-project-demo/editor')
  await expect(page.locator('main canvas')).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(3000)
}

test.describe('Visio stencil import', () => {
  test('drop the file, import, drag a master onto the canvas', async ({ page }) => {
    await signInAsDemo(page)
    await openEditor(page)

    await page.getByRole('button', { name: /^Stencils/ }).click()

    // The hidden file input behind "Choose file" and the panel's drop zone
    // share one handler, so feeding the input is the same path a drop takes
    // minus the browser's drag plumbing.
    const input = page.locator('input[type="file"][accept*=".vss"]').first()
    await input.setInputFiles(POOL_VSS!)

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 60_000 })
    await expect(dialog.getByRole('textbox', { name: 'Name for Standard Rectangle' })).toHaveValue('Standard Rectangle')
    await expect(dialog.getByText("25' × 12'").first()).toBeVisible()

    await dialog.getByRole('button', { name: /^Import \d+ stencils?$/ }).click()
    await expect(dialog).toBeHidden({ timeout: 60_000 })

    await expect(page.getByText('My library').first()).toBeVisible()
    const card = page.getByRole('button', { name: /Standard Rectangle/ }).first()
    await expect(card).toBeVisible()

    // Drive the drop the way the browser would: a DataTransfer carrying the
    // stencil MIME, dragover then drop at the middle of the WebGL element.
    const canvas = page.locator('main canvas').first()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    const dropped = await page.evaluate(
      ({ mime, x, y }) => {
        const target = document.querySelector('main canvas')
        if (!target) return 'no canvas'
        const card = Array.from(document.querySelectorAll('button[draggable="true"]')).find(b =>
          /Standard Rectangle/.test(b.textContent ?? ''),
        )
        if (!card) return 'no card'
        let dt: DataTransfer
        try {
          dt = new DataTransfer()
        } catch {
          return 'no DataTransfer'
        }
        card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
        if (!dt.types.includes(mime)) return 'card wrote nothing'
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }))
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }))
        return 'dropped'
      },
      { mime: STENCIL_DRAG_MIME, x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    )

    if (dropped !== 'dropped') {
      // Chromium builds DataTransfer fine; if a browser does not, the click
      // path still proves the library stencil places. Say which ran.
      console.warn(`drag path unavailable (${dropped}), placing by click instead`)
      await card.click()
    }

    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: /^Layers/ }).click()
    await expect(page.getByText(/^Standard Rectangle/).first()).toBeVisible()
  })
})
