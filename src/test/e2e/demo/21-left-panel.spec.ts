import { test } from '@playwright/test'

import {
  BEAT,
  chapter,
  dismissOverlays,
  login,
  newProject,
  say,
} from './_demo'

// The left panel, tab by tab. Five of them, and they do not have much in
// common: two are lists of what exists, one is a catalogue, and two are ways of
// describing the ground the pool is going into.

test.setTimeout(9 * 60_000)

test('21 · the left panel, tab by tab', async ({ page }) => {
  await login(page)
  await newProject(page, 'Left panel')
  await dismissOverlays(page)

  await chapter(
    page,
    '21',
    'The left panel',
    'Layers, Stencils, Materials, Site, Grade. What each one is for and what is inside it.',
  )

  // Something to look at, or half these panels have nothing to say.
  await page.getByText('Stencils', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT * 2)

  // --- Layers --------------------------------------------------------------
  await page.getByText('Layers', { exact: true }).first().click()
  await say(
    page,
    'Layers · everything on the drawing',
    'Top of the panel is Sheets. A sheet is one drawing of this project, and the active one is what you are looking at.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Each row is one object',
    'Its name, its size, and three controls: a checkbox to select, a padlock, and an eye.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'The padlock stops you moving it by accident', 'Useful once the pool is where you want it.')
  await page.getByRole('button', { name: /lock/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await page.getByRole('button', { name: /lock/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)

  await say(page, 'The eye hides it', 'Hidden objects still count in the quote. Hiding is about the picture, not the price.')
  await page.getByRole('button', { name: /hide|show/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await page.getByRole('button', { name: /hide|show/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)

  await say(page, 'And the search box filters the list', 'Worth having once a design has forty objects on it.')
  await page.locator('input[placeholder*="Search"]').first().fill('rect').catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await page.locator('input[placeholder*="Search"]').first().fill('').catch(() => {})
  await page.waitForTimeout(BEAT)

  // --- Stencils ------------------------------------------------------------
  await page.getByText('Stencils', { exact: true }).first().click()
  await say(
    page,
    'Stencils · the catalogue',
    'Everything you can place, grouped by kind. Seventeen pool shapes, then steps, decks, features, equipment and symbols.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Each card draws the footprint it drops',
    'To scale, and with the size written under the name. What the card says is what lands.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(page, 'The search box covers all of them', 'Faster than scrolling seventy-two cards.')
  await page.locator('input[placeholder*="Search"]').first().fill('spa').catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await page.locator('input[placeholder*="Search"]').first().fill('').catch(() => {})
  await page.waitForTimeout(BEAT)

  // --- Materials -----------------------------------------------------------
  await page.getByText('Materials', { exact: true }).first().click()
  await say(
    page,
    'Materials · finishes, coping and tile',
    'Grouped by where they go. An interior finish is sold by the square foot, coping and waterline tile by the linear foot.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'The price on the card is the price you are charged',
    'Each material points at a line in your price book. If yours has no line for it, the card says so rather than quietly charging the default.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'Picking one here loads the Material brush',
    'Then click an object on the canvas to paint it. The brush does nothing until a material is chosen, and says nothing about it either.',
  )
  await page.waitForTimeout(BEAT * 2)

  // --- Site ----------------------------------------------------------------
  await page.getByText('Site', { exact: true }).first().click()
  await say(
    page,
    'Site · the lot and what is on it',
    'Where the property line goes, how far back the house is, and what the county requires.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Lot width and depth draw the boundary',
    'Until you draw it, the inspector says "no property line drawn" rather than inventing a setback.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'Then place the house, and enter the required setbacks',
    'Front, side, rear and easements. These are what the permit sheet prints, and it refuses to call itself submittable until they are filled in.',
  )
  await page.waitForTimeout(BEAT * 2)

  // --- Grade ---------------------------------------------------------------
  await page.getByText('Grade', { exact: true }).first().click()
  await say(
    page,
    'Grade · how the ground falls',
    'Off by default, because a flat site is the common case and it should cost nothing.',
  )
  await page.waitForTimeout(BEAT)

  await page.locator('input[type="checkbox"]').first().check().catch(() => {})
  await page.waitForTimeout(BEAT)
  await say(
    page,
    'Two surfaces, never one',
    'Existing ground is what the laser saw. Finished grade is where the ground ends up. The difference is the earthwork.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'Datum is your benchmark',
    'The height everything else is measured from, and the height a new shot starts at.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'Add drops an elevation shot', 'Corners first, then spiralling in, so no two ever land on each other.')
  await page.getByRole('button', { name: /^add$/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await page.getByRole('button', { name: /^add$/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'Cut and fill are reported apart, never netted',
    'A yard out is haulage and a yard in is material. They are different jobs with different costs.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'That is the left panel',
    'What exists, what you can add, what it is made of, what it sits on, and how that ground falls.',
  )
  await page.waitForTimeout(BEAT * 2)
})
