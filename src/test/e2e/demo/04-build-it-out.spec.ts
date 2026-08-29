import { test } from '@playwright/test'

import { chapter, clickOnCanvas, dragOnCanvas, login, note, openEditor, say, tool } from './_demo'

const NAME = '04-build-it-out'

/** Each toolbar tool, what it is for, and roughly where to put it. */
const TOOLS: { label: string; key: string; why: string; drop: { x: number; y: number } }[] = [
  {
    label: 'Steps & shelves',
    key: 'S',
    why: 'Entry steps, benches, and tanning ledges. These change wetted area, so they change the finish cost.',
    drop: { x: 0.4, y: 0.44 },
  },
  {
    label: 'Water feature',
    key: 'W',
    why: 'Spillovers, sheer descents, bubblers. Each one is a priced line item and a plumbing run.',
    drop: { x: 0.58, y: 0.42 },
  },
  {
    label: 'Lights',
    key: 'L',
    why: 'Pool and landscape lighting. Quantity drives both the electrical line and a validation rule.',
    drop: { x: 0.46, y: 0.55 },
  },
]

test('Chapter 4 — Build it out', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 4',
    'Build it out',
    'Steps, water features, lights and the deck. Everything you add is measured and priced.',
  )

  await openEditor(page)

  await say(
    page,
    'The toolbar is the whole vocabulary',
    'Ten tools, each with a single-key shortcut. Hover any of them to see the key.',
  )

  for (const t of TOOLS) {
    const btn = page.locator(`[aria-label="${t.label}"]`).first()
    if ((await btn.count()) === 0) {
      note(NAME, `toolbar is missing "${t.label}"`)
      continue
    }
    await say(page, `${t.label}  ·  key ${t.key}`, t.why)
    await tool(page, t.label)
    await clickOnCanvas(page, t.drop)
    await page.waitForTimeout(700)
  }

  const deck = page.locator('[aria-label="Deck"]').first()
  if ((await deck.count()) === 0) {
    note(NAME, 'toolbar is missing the Deck tool')
  } else {
    await say(
      page,
      'Deck  ·  key D',
      'Concrete, pavers, travertine or grass. Deck square footage is usually the second biggest number on a quote.',
    )
    await tool(page, 'Deck')
    await clickOnCanvas(page, { x: 0.5, y: 0.62 })
  }

  await say(
    page,
    'The Stencils panel is the full catalog',
    '72 stencils across five categories: pool shapes, interior features, deck and house, construction symbols, and water and outdoor.',
  )
  const stencils = page.locator('button:has-text("Stencils")').first()
  if ((await stencils.count()) === 0) {
    note(NAME, 'no Stencils panel tab')
  } else {
    await stencils.click()
    await page.waitForTimeout(1500)
    await say(page, 'Search it', 'Type what you want rather than hunting. The command palette does the same thing.')
    const search = page.locator('input[placeholder*="Search"]').first()
    if ((await search.count()) > 0) {
      await search.fill('spa')
      await page.waitForTimeout(1400)
    }
  }

  await say(page, 'Layers list every object', 'Select, rename, reorder, hide. The drawing is never a flat image.')
  const layersTab = page.locator('button:has-text("Layers")').first()
  if ((await layersTab.count()) > 0) {
    await layersTab.click()
    await page.waitForTimeout(1400)
  }

  await say(page, 'Next: materials', 'What each surface is made of, and how that reaches the quote.')
})
