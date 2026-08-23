import { expect, test } from '@playwright/test'

import {
  BEAT,
  canvasBox,
  chapter,
  dismissOverlays,
  login,
  openEditor,
  say,
} from './_demo'

// The five things you do to an object, once you can see it.
//
// Place, select, move, undo, delete. Deliberately no pricing, no documents and
// no panels: this is the chapter for somebody who has the editor open for the
// first time and does not yet know that clicking a stencil places it rather
// than arming a tool.

test('01b · your first five edits', async ({ page }) => {
  await login(page)

  // A clean project, not the newest one.
  //
  // `openEditor` opens whatever was worked on last, which for a seeded database
  // is a finished design with nine objects on it. Teaching "place your first
  // object" over somebody else's pool is confusing, and it broke the layer
  // counts this chapter checks itself against.
  await say(page, 'Start with a new project', 'New project on the dashboard, give it a name, and open the editor.')
  await page.getByRole('button', { name: /new project/i }).first().click()
  // Named per run. A fixed name meant the second recording opened the first
  // recording's project, which already had a pool in it, so "delete the pool"
  // left one behind and the chapter filmed a deletion that looked like it had
  // not worked.
  const name = `Demo walkthrough ${Date.now().toString(36).slice(-4)}`
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
  await page.getByText(name).first().waitFor({ timeout: 60_000 })
  await page.getByText(name).first().click()
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })

  await openEditor(page, new URL(page.url()).pathname)
  await dismissOverlays(page)

  await chapter(
    page,
    '01b',
    'Your first five edits',
    'Place something, select it, move it, undo it, delete it. Everything else in the editor is built on these.',
  )

  const box = await canvasBox(page)
  const at = (fx: number, fy: number) => ({
    x: box.x + box.width * fx,
    y: box.y + box.height * fy,
  })

  // A chapter that narrates deleting a pool over an empty canvas is worse than
  // no chapter, so each step checks the drawing actually got where it claims.
  //
  // Read off surface area rather than the layer count: the layer count lives in
  // the Layers panel and is not on screen while Stencils is open, which is
  // exactly when the first check runs. Surface area is in the inspector and is
  // always visible.
  const drawnSqft = async (): Promise<number> => {
    const text = await page.evaluate(() => document.body.innerText)
    const m = text.match(/SURFACE AREA\s*([\d,]+)/i)
    return m?.[1] ? Number(m[1].replace(/,/g, '')) : -1
  }

  // --- 1. place ------------------------------------------------------------
  await say(
    page,
    '1 · Place something',
    'Open Stencils on the left and click one. It drops straight onto the drawing, you do not draw it out.',
  )
  await page.getByText('Stencils', { exact: true }).first().click()
  await page.waitForTimeout(BEAT)

  await say(page, 'Each card shows the size it drops', "Standard rectangle is 30 by 14 feet.")
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT * 2)

  expect(
    await drawnSqft(),
    'the stencil click placed nothing, so the rest of this chapter would be a lie',
  ).toBeGreaterThan(0)
  await say(page, 'It lands in the middle and the quote wakes up', 'Surface area, perimeter and volume are live on the right.')
  await page.waitForTimeout(BEAT)

  // --- 2. select -----------------------------------------------------------
  await say(
    page,
    '2 · Select it',
    'Click the object, or click its row under Layers. Both do the same thing.',
  )
  await page.getByText('Layers', { exact: true }).first().click()
  await page.waitForTimeout(BEAT)
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT)

  await say(page, 'The inspector fills in', 'Position, geometry and material, all on the right, all editable.')
  await page.waitForTimeout(BEAT * 2)

  // --- 3. move -------------------------------------------------------------
  await say(
    page,
    '3 · Move it',
    'Drag the object itself. Remember: dragging empty ground orbits the camera, dragging the object moves the object.',
  )
  const from = at(0.5, 0.55)
  const to = at(0.62, 0.44)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 24; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 24, from.y + ((to.y - from.y) * i) / 24)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(BEAT * 2)
  expect(await drawnSqft(), 'moving a pool must not change its area').toBeGreaterThan(0)

  // --- 4. undo -------------------------------------------------------------
  await say(
    page,
    '4 · Undo',
    'Command Z, or the arrow in the header. Undo covers the drawing and the ground, not just the last click.',
  )
  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(BEAT * 2)

  await say(page, 'And redo puts it back', 'Command Shift Z.')
  await page.keyboard.press('Meta+Shift+z')
  await page.waitForTimeout(BEAT * 2)

  // --- 5. delete -----------------------------------------------------------
  await say(
    page,
    '5 · Delete',
    'Select it, then Delete or Backspace. With nothing selected the key does nothing, on purpose.',
  )
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT)
  await page.keyboard.press('Delete')
  await page.waitForTimeout(BEAT * 2)
  expect(await drawnSqft(), 'Delete did not remove the selected pool').toBe(0)

  await say(page, 'Gone, and the quote goes with it', 'Command Z brings it back if that was a mistake.')
  await page.keyboard.press('Meta+z')
  await page.waitForTimeout(BEAT * 2)
  expect(await drawnSqft(), 'undo did not bring the pool back').toBeGreaterThan(0)

  // --- where everything lives ---------------------------------------------
  await say(
    page,
    'The rest of the editor, in one pass',
    'Left panel is what you add. Right panel is what you have selected. Bottom is the camera and the checklist.',
  )
  for (const tab of ['Layers', 'Stencils', 'Materials', 'Grade']) {
    await page.getByText(tab, { exact: true }).first().click().catch(() => {})
    await say(page, `Left panel: ${tab}`, leftPanelBlurb(tab))
    await page.waitForTimeout(BEAT)
  }

  await say(
    page,
    "Can't find a command? Press Command K",
    'Every action in the app is in there, including the ones with no button.',
  )
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')

  await say(page, 'That is the editor', 'Place, select, move, undo, delete. Everything else is a variation.')
  await page.waitForTimeout(BEAT * 2)
})

function leftPanelBlurb(tab: string): string {
  switch (tab) {
    case 'Layers':
      return 'Everything on the drawing, in order. Click a row to select it.'
    case 'Stencils':
      return 'The catalogue. Click one to place it.'
    case 'Materials':
      return 'Finishes and coping. What you pick here is what the quote charges.'
    case 'Grade':
      return 'How the ground falls, and how much dirt moves.'
    default:
      return ''
  }
}
