import { test } from '@playwright/test'

import { BEAT, chapter, dismissOverlays, login, note, say } from './_demo'

const NAME = '02-price-book'

test('Chapter 2 — The price book', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 2',
    'The price book',
    'What you charge. Every quote in the app is derived from this, never typed by hand.',
  )

  await page.goto('/settings/price-book')
  await page.waitForLoadState('networkidle').catch(() => {})

  await say(
    page,
    'One row per thing you sell',
    'Each row carries a category, a unit, and a rate. The category is how a drawn shape finds its price.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Why categories matter',
    'Draw a paver deck and the engine looks for the deck row, multiplies your rate by the measured square footage, and the quote moves.',
  )

  const addItem = page.locator('button:has-text("Add item")').first()
  if ((await addItem.count()) === 0) {
    note(NAME, 'no "Add item" button on the price book page')
  } else {
    await say(page, 'Adding a line item', 'Category, unit, and rate are the three things that matter.')
    await addItem.click()
    await page.waitForTimeout(1200)

    const fields = page.locator('input:visible, select:visible')
    const count = await fields.count()
    if (count === 0) {
      note(NAME, 'Add item produced no visible form fields')
    } else {
      // Fill whatever the form actually presents, rather than assuming a shape.
      for (let i = 0; i < Math.min(count, 4); i++) {
        const f = fields.nth(i)
        const tag = await f.evaluate(el => el.tagName.toLowerCase())
        if (tag === 'select') continue
        const ph = (await f.getAttribute('placeholder')) ?? ''
        const value = /rate|price|cost|\$/i.test(ph) ? '14.50' : /qty|unit/i.test(ph) ? '1' : 'Travertine coping'
        await f.fill(value).catch(() => {})
        await page.waitForTimeout(280)
      }
      await say(page, 'Saved to the current version', 'Price books are versioned so an old quote can be replayed exactly.')
      // The dialog must be closed before anything else is clicked: leaving it
      // open made every later click wait on an intercepting overlay.
      await dismissOverlays(page)
    }
  }

  await say(
    page,
    'Versioning is the point',
    'A quote stores which version priced it. Raise your rates tomorrow and last month proposal still reproduces penny for penny.',
  )

  const importLink = page.locator('a:has-text("Import XLSX")').first()
  if ((await importLink.count()) === 0) {
    note(NAME, 'no XLSX import entry point on the price book page')
  } else {
    await say(page, 'Bulk import', 'Most builders already keep this in a spreadsheet, so upload it and map the columns.')
    await importLink.click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await say(page, 'Column mapping', 'You match your spreadsheet headings to the fields the engine needs, then preview before saving.')
  }

  await say(page, 'Next: draw a pool', 'With prices in place, everything you draw starts costing money.')
})
