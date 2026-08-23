import { test } from '@playwright/test'

import {
  BEAT,
  chapter,
  dismissOverlays,
  login,
  newProject,
  say,
} from './_demo'

// The right panel: three tabs, and six stacked sections inside the first one.
//
// It is the half of the editor that answers "what is this thing", and it is the
// only place a number can be typed rather than dragged, which matters because
// a pool is 30 feet 0 inches and not whatever the mouse landed on.

test.setTimeout(9 * 60_000)

test('22 · the inspector, section by section', async ({ page }) => {
  await login(page)
  await newProject(page, 'Inspector')
  await dismissOverlays(page)

  await chapter(
    page,
    '22',
    'The inspector',
    'Design, Specs and Quote. Everything about whatever you have selected.',
  )

  await page.getByText('Stencils', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'With nothing selected it describes the project',
    'Totals for the whole drawing. Select something and every section switches to that object.',
  )
  await page.waitForTimeout(BEAT)

  await page.getByText('Layers', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByText(/Standard rect/i).first().click()
  await page.waitForTimeout(BEAT)

  // --- Design tab, section by section --------------------------------------
  await say(
    page,
    'Design tab · 1 of 6 · the selection card',
    'What this is and its headline size. Rectangle pool, 30 by 14, average 4 foot deep.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    '2 of 6 · Position',
    'X and Y in feet, and R for rotation in degrees. Type here when it has to be exact.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Underneath: distance to the house, and the setback',
    'Both read the site you drew. With no house placed it says so rather than measuring against one you cannot see.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    '3 of 6 · Geometry',
    'L and W are length and width. D is average depth, SH and DP are the shallow and deep ends, SL is the floor slope.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'Change a number and everything downstream moves', 'Widening the pool moves the quote in the same breath.')
  const widthBox = page.locator('input').filter({ hasNot: page.locator('[placeholder]') }).nth(4)
  await widthBox.fill('16').catch(() => {})
  await widthBox.press('Enter').catch(() => {})
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    '4 of 6 · Interior finish, coping, waterline tile',
    'Three separate slots, three separate units. What you pick is what the quote charges, at the price shown.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    '5 of 6 · Computed',
    'Surface area, perimeter, volume and wetted area. Derived, never typed, and marked live.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    '6 of 6 · Quote contribution',
    'What this one object adds to the total, broken into the lines it is responsible for.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'It is a real marginal cost',
    'The quote with this object minus the quote without it. If an object adds nothing, it says so instead of showing you the whole job.',
  )
  await page.waitForTimeout(BEAT * 2)

  // --- Specs ---------------------------------------------------------------
  await page.getByRole('button', { name: 'Specs', exact: true }).first().click().catch(() => {})
  await say(
    page,
    'Specs tab',
    'The written side of the same object: what goes on the spec sheet rather than what drives the price.',
  )
  await page.waitForTimeout(BEAT * 2)

  // --- Quote ---------------------------------------------------------------
  await page.getByRole('button', { name: 'Quote', exact: true }).first().click().catch(() => {})
  await say(
    page,
    'Quote tab · the whole estimate',
    'Every line the drawing produced, its quantity, its unit price and its total.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'And what could not be priced',
    'Anything drawn that your price book has no line for is named here rather than silently costing nothing.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'The tabs are the three questions',
    'Design is what it looks like, Specs is what it is, Quote is what it costs.',
  )
  await page.waitForTimeout(BEAT * 2)
})
