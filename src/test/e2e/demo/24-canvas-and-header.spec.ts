import { test } from '@playwright/test'

import {
  BEAT,
  chapter,
  dismissOverlays,
  login,
  newProject,
  say,
} from './_demo'

// Everything round the edge of the canvas, and the header above it. The bits
// that are not a panel and not a tool, and so tend to go unexplained.

test.setTimeout(9 * 60_000)

test('24 · around the canvas, and the header', async ({ page }) => {
  await login(page)
  await newProject(page, 'Canvas chrome')
  await dismissOverlays(page)

  await chapter(
    page,
    '24',
    'Around the canvas',
    'The sun, the views, the checklist, the quote dock, and everything in the header.',
  )

  await page.getByText('Stencils', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT * 2)

  // --- top centre ----------------------------------------------------------
  await say(
    page,
    'Top centre · Plan, Design, Build, Customer',
    'How the drawing is dressed. Same objects, four different sets of clothes.',
  )
  for (const mode of ['Plan', 'Design', 'Build', 'Customer']) {
    await page.getByRole('button', { name: mode, exact: true }).last().click().catch(() => {})
    await say(page, `Mode · ${mode}`, modeBlurb(mode))
    await page.waitForTimeout(BEAT)
  }
  await page.getByRole('button', { name: 'Design', exact: true }).last().click().catch(() => {})
  await page.waitForTimeout(BEAT)

  // --- live quote ----------------------------------------------------------
  await say(
    page,
    'Top right · Live quote',
    'The running total, tax included, recalculated as you draw. Not a cached number from the last save.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'Open it for the breakdown', 'Grouped by trade, with a subtotal, the tax and a total that adds up.')
  await page.locator('[aria-label*="quote" i], button:has-text("LIVE QUOTE")').first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  // --- bottom left ---------------------------------------------------------
  await say(
    page,
    'Bottom left · Sun study',
    'Drag the slider to move the sun through the day. Sunrise and sunset are for this site and this date.',
  )
  const slider = page.locator('input[type="range"]').first()
  await slider.fill('480').catch(() => {})
  await page.waitForTimeout(BEAT)
  await slider.fill('1140').catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await slider.fill('720').catch(() => {})
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'It answers a real sales question',
    'Where the shade falls at four in the afternoon, which is when people actually sit outside.',
  )
  await page.waitForTimeout(BEAT)

  // --- bottom left view tabs ----------------------------------------------
  await say(
    page,
    'Bottom left · Plan, 3D, Section',
    'The camera. This is the other control that says "Plan", and it is not the one at the top.',
  )
  for (const tab of ['Plan', 'Section', '3D']) {
    await page.getByRole('button', { name: tab, exact: true }).first().click().catch(() => {})
    await say(page, `View · ${tab}`, viewBlurb(tab))
    await page.waitForTimeout(BEAT)
  }

  // --- bottom right --------------------------------------------------------
  await say(
    page,
    'Bottom right · Fit, zoom, and the cube',
    'Fit frames everything. The two buttons zoom. The cube snaps to a fixed angle.',
  )
  await page.getByRole('button', { name: /fit everything in view/i }).click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await page.getByRole('button', { name: /zoom in/i }).click().catch(() => {})
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /zoom out/i }).click().catch(() => {})
  await page.waitForTimeout(BEAT)

  // --- checklist -----------------------------------------------------------
  await say(
    page,
    'Bottom right · Checklist',
    'Three counts: errors, warnings and things that passed. Click one to open it.',
  )
  await page.getByText(/CHECKLIST/i).first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'Each row says what is wrong and how to fix it',
    'Depths not set, no equipment package chosen, a setback under the local minimum.',
  )
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  // --- bottom centre -------------------------------------------------------
  await say(
    page,
    'Bottom centre · Commands',
    'The palette. Every action in the app by name, whether or not it has a button. Command K.',
  )
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  // --- header --------------------------------------------------------------
  await say(
    page,
    'Header · left to right',
    'Your organisation, the customer, the project name, and whether it saved.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'The save indicator is the one to watch',
    'It says "Saved" and how long ago. Autosave fires under a second after you stop, and again when you leave the page.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(page, 'Then undo and redo', 'Command Z and Command Shift Z. They cover the ground as well as the drawing.')
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Header right · Scenes',
    'Saved arrangements of a drawing, so you can show a customer two options without rebuilding either.',
  )
  await page.getByText('Scenes', { exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Export, and Share',
    'Export renders the proposal, the construction packet, the site plan and the screen RFQ. Share makes a link for the customer.',
  )
  await page.getByRole('button', { name: /export document/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Two buttons up here are labelled "coming soon"',
    'Comments and sun study. The sun study one is odd, because the working slider is already sitting at the bottom of the canvas.',
  )
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'That is the whole editor',
    'Panels on the left, inspector on the right, tools at the bottom, camera in the corners, documents in the header.',
  )
  await page.waitForTimeout(BEAT * 2)
})

function modeBlurb(mode: string): string {
  switch (mode) {
    case 'Plan':
      return 'Flat and diagrammatic, the way a plan sheet reads.'
    case 'Design':
      return 'The working view. Materials and colour, everything selectable.'
    case 'Build':
      return 'Construction overlays: rebar spacing and the gas line.'
    case 'Customer':
      return 'The pretty one. Turn the laptop round for this.'
    default:
      return ''
  }
}

function viewBlurb(tab: string): string {
  switch (tab) {
    case 'Plan':
      return 'Straight down and square on. Dragging always pans here, never orbits.'
    case 'Section':
      return 'A cut through the pool, showing the floor slope from shallow to deep.'
    case '3D':
      return 'Free camera. Left drag orbits, shift or right drag pans.'
    default:
      return ''
  }
}
