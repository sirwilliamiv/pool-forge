import { test } from '@playwright/test'

import { BEAT, chapter, clickOnCanvas, login, note, openEditor, say, tool } from './_demo'

const NAME = '05-materials'

test('Chapter 5 — Materials', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 5',
    'Materials',
    'What each surface is made of. This is where a design starts costing different amounts.',
  )

  await openEditor(page)

  await say(
    page,
    'The Materials panel',
    'Interior finishes, coping, tile bands, and deck surfaces.',
  )
  const materialsTab = page.locator('button:has-text("Materials")').first()
  if ((await materialsTab.count()) === 0) {
    note(NAME, 'no Materials panel tab in the editor')
  } else {
    await materialsTab.click()
    await page.waitForTimeout(1600)
  }

  await say(
    page,
    'Why this is not cosmetic',
    'Plaster, pebble and quartz are different prices per square foot. Picking one moves the quote, it does not just recolour the render.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'The material brush  ·  key B', 'Pick a material, then paint it onto a surface in the scene.')
  const brush = page.locator('[aria-label="Material brush"]').first()
  if ((await brush.count()) === 0) {
    note(NAME, 'toolbar is missing the Material brush')
  } else {
    await tool(page, 'Material brush')
    await clickOnCanvas(page, { x: 0.48, y: 0.5 })
  }

  await say(
    page,
    'Selection shows on the right',
    'Any selected object reports its material alongside its measurements, so you can see what drives its price.',
  )
  const materialSection = page.locator('text=/MATERIAL/i').first()
  if ((await materialSection.count()) === 0) {
    note(NAME, 'no MATERIAL section in the right-hand inspector')
  }
  await page.waitForTimeout(BEAT)

  await say(page, 'Next: measure and validate', 'What the drawing adds up to, and what the app refuses to let you send.')
})
