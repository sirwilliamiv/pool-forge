import { expect, test, type Page } from '@playwright/test'

import {
  BEAT,
  chapter,
  clickOnCanvas,
  dismissOverlays,
  login,
  note,
  openEditor,
  pickPoolShape,
  say,
} from './_demo'

const NAME = '11-showcase'

/**
 * The long take: one composed backyard, built object by object.
 *
 * The first cut placed thirty-six objects and showed none of them. Stencils
 * drop in a staggered column beside the pool, so the camera sat on a lone
 * rectangle while the rest of the build ran ninety-six feet off screen. Placing
 * things is not the same as designing something.
 *
 * Every object here is positioned through the inspector's numeric fields, which
 * is also how a builder would really do it: a pool is 32'0", not "about this
 * big".
 */

/**
 * The design is authored around a comfortable origin and then shifted so the
 * whole build straddles world zero. The camera targets the origin, so a layout
 * laid out in positive coordinates sits entirely in one quadrant and the tour
 * orbits empty ground.
 */
const ORIGIN_X = -46
const ORIGIN_Y = -37

/** Inspector numeric fields, in DOM order, for a selected shape. */
const FIELD = { x: 0, y: 1, rotation: 2, length: 3, width: 4 } as const

interface Piece {
  /** Catalog name, as it appears in the Stencils panel and the Layers list. */
  name: string
  /** Feet from the sheet origin. */
  x: number
  y: number
  /** Optional resize, in feet. Several catalog defaults are placeholder-sized. */
  l?: number
  w?: number
}

/**
 * The design. A 32x16 pool at the centre, deck wrapping it, features on the
 * water, fire and seating out on the deck.
 *
 * Ground covers go down first so they sit behind everything else.
 */
const GROUND: Piece[] = [
  { name: 'Grass area', x: 0, y: 0, l: 92, w: 74 },
  // A patio beside the pool, not under it: a deck placed over the pool
  // footprint renders on top of the water and hides it entirely.
  { name: 'Paver deck', x: 16, y: 42, l: 60, w: 24 },
]

const ON_THE_WATER: Piece[] = [
  { name: 'Sun shelf', x: 30, y: 16 },
  { name: 'Tanning ledge', x: 52, y: 16, l: 10, w: 6 },
  { name: 'Swim out bench', x: 32, y: 28 },
  { name: 'Bubblers', x: 34, y: 18 },
  { name: 'Main drain', x: 46, y: 24 },
]

const WATER_AND_FIRE: Piece[] = [
  { name: 'Spa spillover', x: 64, y: 19 },
  { name: 'Waterfall', x: 24, y: 21 },
  { name: 'Water bowl', x: 65, y: 25 },
  { name: 'Fire bowl', x: 24, y: 14 },
  { name: 'Fire pit', x: 70, y: 50, l: 6, w: 6 },
]

const STRUCTURES: Piece[] = [
  { name: 'Covered lanai', x: 18, y: 46, l: 20, w: 12 },
  { name: 'Outdoor kitchen placeholder', x: 48, y: 46, l: 16, w: 8 },
  { name: 'Equipment pad', x: 82, y: 10, l: 6, w: 5 },
]

/** Fill one inspector field by index and commit it. */
async function setField(page: Page, index: number, valueFt: number): Promise<void> {
  const input = page.locator('input[type="number"]').nth(index)
  if ((await input.count()) === 0) return
  await input.fill(String(valueFt)).catch(() => {})
  await input.press('Enter').catch(() => {})
  await page.waitForTimeout(150)
}

/**
 * Select the object that was just added, by taking the newest row in Layers.
 *
 * Not by name: the layers list labels every generic stencil "Stencil" rather
 * than its catalog name, so a yard of twenty objects shows twenty identical
 * rows. Adding a shape also leaves nothing selected, so the inspector is empty
 * until something here clicks a row. Newest sorts first.
 */
async function selectNewest(page: Page): Promise<boolean> {
  const layersTab = page.locator('button:has-text("Layers")').first()
  if ((await layersTab.count()) > 0) await layersTab.click().catch(() => {})
  await page.waitForTimeout(300)
  const row = page.locator('[role="button"]').filter({ hasText: /['′]/ }).first()
  if ((await row.count()) === 0) return false
  await row.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(420)
  return (await page.locator('input[type="number"]').count()) > 0
}

/** Add a stencil from the panel, then place it exactly through the inspector. */
async function buildPiece(page: Page, piece: Piece): Promise<boolean> {
  const stencilsTab = page.locator('button:has-text("Stencils")').first()
  if ((await stencilsTab.count()) > 0) await stencilsTab.click().catch(() => {})
  await page.waitForTimeout(220)

  const search = page.locator('input[placeholder*="Search" i]').first()
  if ((await search.count()) > 0) {
    await search.fill(piece.name)
    await page.waitForTimeout(220)
  }
  const card = page.locator(`button:has-text("${piece.name}")`).first()
  if ((await card.count()) === 0) return false
  await card.click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(400)

  if (!(await selectNewest(page))) return false

  if (piece.l !== undefined) await setField(page, FIELD.length, piece.l)
  if (piece.w !== undefined) await setField(page, FIELD.width, piece.w)
  await setField(page, FIELD.x, piece.x + ORIGIN_X)
  await setField(page, FIELD.y, piece.y + ORIGIN_Y)
  return true
}

async function buildAll(page: Page, pieces: Piece[]): Promise<string[]> {
  const missed: string[] = []
  for (const piece of pieces) {
    if (!(await buildPiece(page, piece))) missed.push(piece.name)
  }
  return missed
}

test('Chapter 11 — The full build', async ({ page }) => {
  test.setTimeout(25 * 60_000)

  await login(page)
  await chapter(
    page,
    'Chapter 11',
    'The full build',
    'One backyard, designed properly. Every object placed where it belongs.',
  )

  await say(page, 'Start with an empty lot', 'A new project, nothing drawn, every measurement reading zero.')
  await page.goto('/dashboard')
  await page.click('button:has-text("New project")')
  await page.waitForTimeout(900)
  await page.fill('input[name="name"]', 'Whitfield estate — designed build').catch(() => {})
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

  // ---- ground -------------------------------------------------------------
  // Ground first, and it has to be first: creation order is draw order, so a
  // deck placed after the pool renders straight over the top of it.
  await say(page, 'The lot and the deck first', 'Creation order is draw order, so ground covers go down before anything that sits on them.')
  const groundMissed = await buildAll(page, GROUND)
  if (groundMissed.length) note(NAME, `ground pieces not found: ${groundMissed.join(', ')}`)
  await say(page, 'A 54 by 38 paver deck', 'Deck square footage is usually the second largest number on the whole quote.')

  // ---- the pool -----------------------------------------------------------
  await say(page, 'The pool first', 'Everything else positions relative to it, so it has to exist before anything else.')
  const picked = await pickPoolShape(page, 'Rectangle')
  if (!picked) note(NAME, 'pool shape picker did not arm the tool')
  await clickOnCanvas(page, { x: 0.45, y: 0.47 })
  await page.waitForTimeout(900)

  await say(page, 'Sized to the foot', 'Thirty-two by sixteen. Dimensions are numeric fields, which is what makes this estimating software rather than a drawing app.')
  if (await selectNewest(page)) {
    await setField(page, FIELD.length, 32)
    await setField(page, FIELD.width, 16)
    await setField(page, FIELD.x, 30 + ORIGIN_X)
    await setField(page, FIELD.y, 16 + ORIGIN_Y)
  } else {
    note(NAME, 'could not select the pool to size it')
  }
  await page.waitForTimeout(BEAT)

  // ---- on the water -------------------------------------------------------
  await say(page, 'Features on the water', 'Shelf, ledge, bench, bubblers, and the main drain at the deep end.')
  const waterMissed = await buildAll(page, ON_THE_WATER)
  if (waterMissed.length) note(NAME, `water features not found: ${waterMissed.join(', ')}`)
  await say(page, 'Wetted area just moved', 'More wetted area is more plaster, more chemistry, more heat. A tanning ledge is never free.')

  // ---- water and fire -----------------------------------------------------
  await say(page, 'Water and fire', 'Spa spillover, waterfall, water bowl, fire bowl, and a fire pit out on the deck.')
  const fireMissed = await buildAll(page, WATER_AND_FIRE)
  if (fireMissed.length) note(NAME, `water and fire not found: ${fireMissed.join(', ')}`)
  await say(page, 'This is where a job changes tier', 'Each one is a line item, a plumbing run, and usually a gas line as well.')

  // ---- structures ---------------------------------------------------------
  await say(page, 'The structures around it', 'Covered lanai, outdoor kitchen, and the equipment pad off to one side.')
  const structMissed = await buildAll(page, STRUCTURES)
  if (structMissed.length) note(NAME, `structures not found: ${structMissed.join(', ')}`)

  // ---- look at it ---------------------------------------------------------
  await say(page, 'Now look at what that built', 'A composed backyard, every object exactly where it was told to go.')
  // Pull the camera back onto the build: the presets change orientation but
  // keep their target, so without this the tour orbits an empty corner of the
  // sheet while the yard sits off to one side.
  const canvas = page.locator('canvas').first()
  const box = await canvas.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 320)
      await page.waitForTimeout(220)
    }
  }
  await page.waitForTimeout(900)
  for (const view of ['top', 'iso', 'front', 'left'] as const) {
    const btn = page.locator(`[aria-label="Snap camera to ${view} view"]`).first()
    if ((await btn.count()) === 0) continue
    await btn.click().catch(() => {})
    await page.waitForTimeout(2600)
  }

  await say(page, 'The sun moves across it', 'Shade is a siting decision and a selling point, so the sun study sits on the design surface.')
  const slider = page.locator('input[type="range"]').first()
  if ((await slider.count()) > 0) {
    for (const v of ['15', '45', '75', '95']) {
      await slider.fill(v).catch(() => {})
      await page.waitForTimeout(1100)
    }
  }

  // ---- the numbers --------------------------------------------------------
  await say(page, 'Every object is a line', 'Priced from the book against a measured quantity, never typed by hand.')
  const quoteTab = page.locator('button:has-text("Quote")').first()
  if ((await quoteTab.count()) > 0) {
    await quoteTab.click().catch(() => {})
    await page.waitForTimeout(2400)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(1800)
  }

  await say(page, 'And it is checked', 'Thirteen rules, against a design dense enough to have something to say about.')
  const dock = page.getByText(/validation/i).first()
  if ((await dock.count()) > 0) {
    await dock.click().catch(() => {})
    await page.waitForTimeout(2200)
  }

  // ---- the deliverable ----------------------------------------------------
  await say(page, 'Then it becomes paper', 'The same build, presented for whoever needs it.')
  await page.goto(href)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(1400)

  const proposal = page
    .locator('a:has-text("Customer proposal"), button:has-text("Customer proposal")')
    .first()
  if ((await proposal.count()) > 0) {
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

  const total = GROUND.length + ON_THE_WATER.length + WATER_AND_FIRE.length + STRUCTURES.length
  const missed = groundMissed.length + waterMissed.length + fireMissed.length + structMissed.length
  await say(page, 'That is the app', `${total - missed} objects, designed, measured, priced and documented from one drawing.`)
  await page.waitForTimeout(BEAT)

  expect(total - missed).toBeGreaterThan(10)
})
