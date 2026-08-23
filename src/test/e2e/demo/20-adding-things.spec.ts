import { expect, test } from '@playwright/test'

import {
  BEAT,
  chapter,
  clickOnCanvas,
  dismissOverlays,
  login,
  newProject,
  say,
  surfaceSqft,
} from './_demo'

// Every way to put something on the drawing, and the two that look like ways
// and are not.
//
// The add tools each carry a fixed stencil (`ADD_TOOL_STENCIL` in
// `interactions/gestures.ts`), the pool tool carries whatever the picker last
// chose, and a click is the centre of the new object. After it lands the tool
// goes back to Move on its own, which is worth saying out loud because it
// catches people out when they meant to place three lights.

test.setTimeout(9 * 60_000)

test('20 · adding things to the scene', async ({ page }) => {
  await login(page)
  await newProject(page, 'Adding things')
  await dismissOverlays(page)

  await chapter(
    page,
    '20',
    'Adding things to the scene',
    'Four routes that work, and two gestures that look like they should and do not.',
  )

  // --- route 1: the stencil panel -----------------------------------------
  await say(
    page,
    'Route 1 · Click a card in Stencils',
    'The simplest one. It drops in the middle of the drawing, at the size printed on the card.',
  )
  await page.getByText('Stencils', { exact: true }).first().click()
  await page.waitForTimeout(BEAT)
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT * 2)
  expect(await surfaceSqft(page), 'the stencil card placed nothing').toBeGreaterThan(0)
  await say(page, 'Placed', '30 by 14 feet, exactly what the card said. No dragging, no sizing.')
  await page.waitForTimeout(BEAT)

  // --- route 2: a tool, then a click --------------------------------------
  await say(
    page,
    'Route 2 · Pick a tool, then click the canvas',
    'The tool decides what gets placed. Your click is the centre of it.',
  )
  await page.waitForTimeout(BEAT)

  const addTools: { label: string; key: string; places: string }[] = [
    { label: 'Steps & shelves', key: 'S', places: 'corner steps' },
    { label: 'Water feature', key: 'W', places: 'a waterfall' },
    { label: 'Lights', key: 'L', places: 'a light' },
    { label: 'Deck', key: 'D', places: 'a concrete deck' },
  ]

  const spots = [
    { x: 0.34, y: 0.42 },
    { x: 0.66, y: 0.40 },
    { x: 0.36, y: 0.66 },
    { x: 0.68, y: 0.68 },
  ]

  for (const [i, t] of addTools.entries()) {
    await say(page, `${t.label} · shortcut ${t.key}`, `Click the canvas and it places ${t.places}.`)
    await page.getByRole('button', { name: t.label, exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(600)
    await clickOnCanvas(page, spots[i] ?? { x: 0.5, y: 0.5 })
    await page.waitForTimeout(BEAT)
    await say(
      page,
      'And the tool goes back to Move by itself',
      'One click, one object. To place three lights, press L three times.',
    )
    await page.waitForTimeout(BEAT)
  }

  // --- route 3: the pool shape picker -------------------------------------
  await say(
    page,
    'Route 3 · The pool tool remembers a shape',
    'The chevron next to the pool button opens 17 shapes. Pick one, then click the canvas.',
  )
  await page.getByRole('button', { name: /pool shape|shape picker/i }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await page.getByText(/Grecian/i).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await clickOnCanvas(page, { x: 0.5, y: 0.3 })
  await say(page, 'That shape stays loaded', 'The next canvas click with the pool tool places another Grecian.')
  await page.waitForTimeout(BEAT)

  // --- route 4: the command palette ---------------------------------------
  await say(
    page,
    'Route 4 · Command K',
    'Everything that can be added is in here by name, including things with no button anywhere.',
  )
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(BEAT)
  await page.keyboard.type('waterfall')
  await page.waitForTimeout(BEAT)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await say(page, 'It tells you where it went', 'Added objects land in the Layers list, ready to move.')
  await page.waitForTimeout(BEAT)

  // --- the two that do not work -------------------------------------------
  await say(
    page,
    'Now the two that look like they should work',
    'Worth knowing so you do not spend ten minutes thinking you are doing it wrong.',
  )
  await page.waitForTimeout(BEAT)

  const before = await surfaceSqft(page)
  await say(
    page,
    'You cannot drag out a shape',
    'Press, drag, release, and nothing is placed. The drag is read as a camera orbit and abandoned without a word.',
  )
  await page.getByRole('button', { name: 'Deck', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(400)
  const box = await page.locator('canvas').first().boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.75)
    await page.mouse.down()
    for (let i = 1; i <= 16; i++) {
      await page.mouse.move(
        box.x + box.width * (0.3 + 0.2 * (i / 16)),
        box.y + box.height * (0.75 - 0.1 * (i / 16)),
      )
      await page.waitForTimeout(22)
    }
    await page.mouse.up()
  }
  await page.waitForTimeout(BEAT * 2)
  expect(
    await surfaceSqft(page),
    'drag-to-draw placed something, so this caption is now wrong and the chapter needs rewriting',
  ).toBe(before)
  await say(page, 'Nothing happened, and nothing said so', 'Click, do not drag. This one is on our list.')
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'And the Comment tool does nothing at all',
    'It is on the toolbar with a shortcut, and clicking the canvas with it writes a line to the console. Comments are not built yet.',
  )
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(600)
  await clickOnCanvas(page, { x: 0.5, y: 0.5 })
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'So: click a stencil, or pick a tool and click once',
    'Those are the two you will use. Command K is the escape hatch when you cannot find the button.',
  )
  await page.waitForTimeout(BEAT * 2)
})
