import { test } from '@playwright/test'

import { BEAT, chapter, dragOnCanvas, login, note, openEditor, say, tool } from './_demo'

const NAME = '06-measure-validate'

test('Chapter 6 — Measure and validate', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 6',
    'Measure and validate',
    'What the drawing adds up to, and what the app will not let you send.',
  )

  await openEditor(page)

  await say(
    page,
    'Everything is already measured',
    'Surface area, perimeter, volume in gallons, wetted area, deck area, coping in linear feet. Derived from the geometry on every change.',
  )
  const computed = page.locator('text=/COMPUTED/i').first()
  if ((await computed.count()) === 0) {
    note(NAME, 'no COMPUTED panel visible in the editor')
  }
  await page.waitForTimeout(BEAT)

  await say(page, 'The measure tool  ·  key M', 'For the distances the engine does not derive for you: setbacks, clearances, a gate swing.')
  const measure = page.locator('[aria-label="Measure"]').first()
  if ((await measure.count()) === 0) {
    note(NAME, 'toolbar is missing the Measure tool')
  } else {
    await tool(page, 'Measure')
    await dragOnCanvas(page, { x: 0.3, y: 0.68 }, { x: 0.66, y: 0.68 })
  }

  await say(page, 'Annotations  ·  key T', 'Notes for whoever builds it. They print on the construction packet.')
  const annotate = page.locator('[aria-label="Annotation"]').first()
  if ((await annotate.count()) === 0) {
    note(NAME, 'toolbar is missing the Annotation tool')
  } else {
    await tool(page, 'Annotation')
    await page.waitForTimeout(800)
    await page.keyboard.press('Escape')
  }

  await say(
    page,
    'Validation runs continuously',
    '13 rules watch the design: pass, warn, or block. The counter sits in the bottom right of the canvas.',
  )
  // Playwright cannot mix a CSS selector and a text= engine in one string.
  const dock = page.getByText(/validation/i).first()
  if ((await dock.count()) === 0) {
    note(NAME, 'validation dock not found in the editor')
  } else {
    await dock.click().catch(() => {})
    await page.waitForTimeout(1600)
    await say(
      page,
      'Click a problem to jump to it',
      'Each finding carries the id of the object at fault, so the canvas selects it for you.',
    )
  }

  await say(
    page,
    'Blocking versus advisory',
    'A warning lets you proceed. A blocking error stops the export, because the point is that a proposal cannot go out describing something unbuildable.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'Next: the quote and the documents', 'The part the customer actually sees.')
})
