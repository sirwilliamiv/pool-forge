import { expect, test } from '@playwright/test'

import {
  BEAT,
  chapter,
  clickOnCanvas,
  dismissOverlays,
  dragOnCanvas,
  login,
  note,
  openEditor,
  say,
  pickPoolShape,
  tool,
} from './_demo'

const NAME = '11-showcase'

/**
 * The long take: a complete high-end backyard, built object by object.
 *
 * The teaching chapters each cover one idea in forty seconds. This one exists to
 * show the app carrying a real job, with enough in the scene that the quote,
 * the validation rules and the view modes have something to actually say.
 *
 * Every name below is a real entry in the 72-stencil catalog.
 */
const INTERIOR = [
  'Sun shelf',
  'Tanning ledge',
  'Swim out bench',
  'Bench',
  'Bubblers',
  'Umbrella hole',
  'Deck jets',
  'Main drain',
  'Return',
  'Light',
]

const WATER_AND_FIRE = [
  'Spa spillover',
  'Waterfall',
  'Spillway',
  'Water bowl',
  'Fire bowl',
  'Fire pit',
  'Deck jet',
  'Raised wall',
  'Outdoor kitchen placeholder',
]

const YARD = [
  'Paver deck',
  'Coping strip',
  'Raised deck',
  'Waterfall wall',
  'Step down',
  'Covered lanai',
  'Pillar',
  'Screen cage',
  'Fence',
  'Deco drain',
  'Grass area',
]

const CONSTRUCTION = [
  'Equipment pad',
  'Property line',
  'Setback line',
  'Dimension line',
  'Construction notes block',
  'Job specification block',
]

/** Click a stencil card by its catalog name. Returns false if it never appeared. */
async function place(page: import('@playwright/test').Page, name: string): Promise<boolean> {
  const search = page.locator('input[placeholder*="Search" i]').first()
  if ((await search.count()) > 0) {
    await search.fill(name)
    await page.waitForTimeout(200)
  }
  const card = page.locator(`button:has-text("${name}"), [role="button"]:has-text("${name}")`).first()
  if ((await card.count()) === 0) return false
  const ok = await card.click({ timeout: 6000 }).then(() => true).catch(() => false)
  await page.waitForTimeout(320)
  return ok
}

async function placeAll(
  page: import('@playwright/test').Page,
  names: string[],
): Promise<{ placed: number; missed: string[] }> {
  const missed: string[] = []
  let placed = 0
  for (const name of names) {
    if (await place(page, name)) placed += 1
    else missed.push(name)
  }
  return { placed, missed }
}

/** Read the live quote total, for showing the number move as objects land. */
async function quoteText(page: import('@playwright/test').Page): Promise<string> {
  const el = page.locator('text=/LIVE QUOTE/i').first()
  if ((await el.count()) === 0) return ''
  const box = el.locator('xpath=..')
  return ((await box.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 60)
}

test('Chapter 11 — The full build', async ({ page }) => {
  test.setTimeout(20 * 60_000)

  await login(page)
  await chapter(
    page,
    'Chapter 11',
    'The full build',
    'One backyard, start to finish. Thirty-six objects, a real quote, and every document at the end.',
  )

  // ---- 1. Empty lot -------------------------------------------------------
  await say(page, 'Start with an empty lot', 'A new project, nothing drawn, and a quote that reads nothing.')
  await page.goto('/dashboard')
  await page.click('button:has-text("New project")')
  await page.waitForTimeout(900)
  await page.fill('input[name="name"]', 'Whitfield estate — full build').catch(() => {})
  await page.fill('input[name="customerName"]', 'Sarah Whitfield').catch(() => {})
  await page.click('button:has-text("Create")')
  await page.waitForTimeout(2500)
  await dismissOverlays(page)

  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle').catch(() => {})
  const href = await page.locator('a[href*="/projects/"]').first().getAttribute('href')
  if (!href) {
    note(NAME, 'no project link after creating the showcase project')
    return
  }
  await openEditor(page, href)

  await say(page, 'Nothing on the board yet', 'Every measurement reads zero. This is the baseline everything else is measured against.')
  await page.waitForTimeout(BEAT)

  // ---- 2. The pool --------------------------------------------------------
  await say(page, 'The pool goes down first', 'Everything else in the catalog positions itself relative to it.')
  const picked = await pickPoolShape(page, 'Rectangle')
  if (!picked) note(NAME, 'pool shape picker did not activate the tool')
  // A click places; a drag is a camera orbit. ToolGestures bails out of
  // placement once the pointer moves more than four pixels.
  await clickOnCanvas(page, { x: 0.45, y: 0.47 })
  await page.waitForTimeout(900)
  await say(page, 'Click to place, then size it', 'Dimensions are numeric fields on the right, not corner handles on the canvas.')

  await say(page, 'Measured the moment it exists', 'Surface area, perimeter, volume in gallons and wetted area, all derived from the footprint.')
  await clickOnCanvas(page, { x: 0.45, y: 0.47 })
  await page.waitForTimeout(BEAT)

  // ---- 3. Interior features ----------------------------------------------
  await say(page, 'Ten interior features', 'Shelves, benches, jets and drains. These change wetted area, which is what the interior finish is priced on.')
  const stencilsTab = page.locator('button:has-text("Stencils")').first()
  if ((await stencilsTab.count()) === 0) {
    note(NAME, 'no Stencils panel, cannot build the showcase')
    return
  }
  await stencilsTab.click()
  await page.waitForTimeout(1000)

  const interior = await placeAll(page, INTERIOR)
  if (interior.missed.length) note(NAME, `interior features not found in the panel: ${interior.missed.join(', ')}`)
  await say(page, `${interior.placed} interior features placed`, 'A tanning ledge is not free: more wetted area is more plaster, more chemicals, more heat.')
  await page.waitForTimeout(BEAT)

  // ---- 4. Water and fire --------------------------------------------------
  await say(page, 'Water and fire', 'The nine objects that separate a mid-range job from a high-end one.')
  const water = await placeAll(page, WATER_AND_FIRE)
  if (water.missed.length) note(NAME, `water and fire objects not found: ${water.missed.join(', ')}`)
  await say(page, `${water.placed} water and fire features`, 'Each one is a line item, a plumbing run, and usually a gas line too.')
  await page.waitForTimeout(BEAT)

  // ---- 5. The yard --------------------------------------------------------
  await say(page, 'Now the yard around it', 'Deck, coping, raised deck, lanai, screen cage, fence.')
  const yard = await placeAll(page, YARD)
  if (yard.missed.length) note(NAME, `yard objects not found: ${yard.missed.join(', ')}`)
  await say(page, `${yard.placed} yard objects`, 'Deck square footage is usually the second largest number on the whole quote.')
  await page.waitForTimeout(BEAT)

  // ---- 6. Move something, to show placement is editable -------------------
  await say(page, 'Everything is editable', 'Objects drop beside the pool and get dragged into position from there.')
  await tool(page, 'Move')
  await dragOnCanvas(page, { x: 0.72, y: 0.36 }, { x: 0.40, y: 0.30 })
  await dragOnCanvas(page, { x: 0.72, y: 0.44 }, { x: 0.62, y: 0.66 })
  await page.waitForTimeout(BEAT)

  // ---- 7. Materials -------------------------------------------------------
  await say(page, 'Materials are a price, not a colour', 'Plaster, pebble and quartz are different rates per square foot on the same geometry.')
  const materialsTab = page.locator('button:has-text("Materials")').first()
  if ((await materialsTab.count()) > 0) {
    await materialsTab.click()
    await page.waitForTimeout(1600)
  } else {
    note(NAME, 'no Materials panel tab')
  }
  await tool(page, 'Material brush')
  await clickOnCanvas(page, { x: 0.45, y: 0.47 })
  await page.waitForTimeout(BEAT)

  // ---- 8. Construction layer ---------------------------------------------
  await say(page, 'The layer the customer never sees', 'Equipment pad, property line, setbacks, dimensions and the notes blocks the crew reads.')
  const stencilsAgain = page.locator('button:has-text("Stencils")').first()
  if ((await stencilsAgain.count()) > 0) {
    await stencilsAgain.click()
    await page.waitForTimeout(900)
  }
  const construction = await placeAll(page, CONSTRUCTION)
  if (construction.missed.length) note(NAME, `construction symbols not found: ${construction.missed.join(', ')}`)
  await say(page, `${construction.placed} construction symbols`, 'These print on the construction packet and the site plan, not on the proposal.')

  // ---- 9. Layers ----------------------------------------------------------
  await say(page, 'Every object is listed', 'Nothing here is a flat image. Each one is selectable, nameable and priced on its own.')
  const layersTab = page.locator('button:has-text("Layers")').first()
  if ((await layersTab.count()) > 0) {
    await layersTab.click()
    await page.waitForTimeout(1800)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(1200)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(1200)
  }

  // ---- 10. Validation -----------------------------------------------------
  await say(page, 'Validation against a real design', 'Thirteen rules, and a build this dense actually gives them something to catch.')
  const dock = page.getByText(/validation/i).first()
  if ((await dock.count()) > 0) {
    await dock.click().catch(() => {})
    await page.waitForTimeout(2000)
  } else {
    note(NAME, 'validation dock not found')
  }

  // ---- 11. The quote ------------------------------------------------------
  await say(page, 'The quote on a real build', 'Every object placed is a line, priced from the book against a measured quantity.')
  const quoteTab = page.locator('button:has-text("Quote")').first()
  if ((await quoteTab.count()) > 0) {
    await quoteTab.click()
    await page.waitForTimeout(2200)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(1600)
  } else {
    note(NAME, 'no Quote tab in the inspector')
  }
  const total = await quoteText(page)
  if (total) await say(page, 'Live total', total)

  // ---- 12. Views ----------------------------------------------------------
  await say(page, 'The same build, four ways', 'Plan for layout, Design to make it look right, Build for the crew, Customer for the buyer.')
  for (const mode of ['Plan', 'Design', 'Build', 'Customer']) {
    const btn = page.getByRole('button', { name: mode, exact: true }).last()
    if ((await btn.count()) === 0) continue
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    await btn.click({ timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1700)
  }

  await say(page, 'And from every angle', 'One scene, five camera presets.')
  for (const view of ['top', 'iso', 'left', 'front']) {
    const btn = page.locator(`[aria-label="Snap camera to ${view} view"]`).first()
    if ((await btn.count()) === 0) continue
    await btn.click().catch(() => {})
    await page.waitForTimeout(1400)
  }

  // ---- 13. Documents ------------------------------------------------------
  await say(page, 'Four documents from one build', 'The same project, presented for whoever needs it.')
  await page.goto(href)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1400)

  const proposal = page
    .locator('a:has-text("Customer proposal"), button:has-text("Customer proposal")')
    .first()
  if ((await proposal.count()) > 0) {
    await say(page, 'The customer proposal', 'Branded, priced, and signable from a share link.')
    await proposal.click().catch(() => {})
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2600)
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 800)
      await page.waitForTimeout(1300)
    }
  } else {
    note(NAME, 'customer proposal entry point missing')
  }

  const placedTotal = interior.placed + water.placed + yard.placed + construction.placed
  await say(page, 'That is the app', `${placedTotal} objects, measured, priced and documented from one drawing.`)
  await page.waitForTimeout(BEAT)

  // Recorded rather than asserted loudly: the brief is to keep filming. But a
  // run that placed almost nothing is not a showcase, and should fail.
  expect(placedTotal).toBeGreaterThan(20)
})
