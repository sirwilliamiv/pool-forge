import { test } from '@playwright/test'

import {
  BEAT,
  chapter,
  clickOnCanvas,
  dismissOverlays,
  login,
  newProject,
  say,
} from './_demo'

// All ten toolbar buttons, one at a time, including the two that do not do what
// their button implies.
//
// Taken from `TOOLS` in `Toolbar.tsx` and the click handler in `ToolGestures`,
// so if a tool changes and this chapter does not, the recording is wrong.

test.setTimeout(9 * 60_000)

test('23 · every tool on the toolbar', async ({ page }) => {
  await login(page)
  await newProject(page, 'Every tool')
  await dismissOverlays(page)

  await chapter(
    page,
    '23',
    'Every tool on the toolbar',
    'Ten buttons, left to right. What each one does, and what it places.',
  )

  await page.getByText('Stencils', { exact: true }).first().click()
  await page.waitForTimeout(600)
  await page.getByText(/Standard rectangle/i).first().click()
  await page.waitForTimeout(BEAT * 2)

  // --- V -------------------------------------------------------------------
  await say(
    page,
    'V · Move',
    'The default, and where every other tool returns to. Click to select, drag an object to move it.',
  )
  await page.getByRole('button', { name: 'Move', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)

  // --- R -------------------------------------------------------------------
  await say(
    page,
    'R · Pool shape',
    'The chevron beside it opens all seventeen shapes. Whichever you pick stays loaded until you pick another.',
  )
  await page.waitForTimeout(BEAT * 2)

  // --- S W L D -------------------------------------------------------------
  const placers: { label: string; key: string; blurb: string; at: { x: number; y: number } }[] = [
    {
      label: 'Steps & shelves',
      key: 'S',
      blurb: 'Places corner steps. Swap for another kind afterwards from the Stencils panel.',
      at: { x: 0.36, y: 0.44 },
    },
    {
      label: 'Water feature',
      key: 'W',
      blurb: 'Places a waterfall.',
      at: { x: 0.64, y: 0.42 },
    },
    {
      label: 'Lights',
      key: 'L',
      blurb: 'Places one pool light. Press L again for the next one.',
      at: { x: 0.44, y: 0.62 },
    },
    {
      label: 'Deck',
      key: 'D',
      blurb: 'Places a concrete deck, thirty-five by twenty-two feet.',
      at: { x: 0.62, y: 0.66 },
    },
  ]

  for (const t of placers) {
    await say(page, `${t.key} · ${t.label}`, t.blurb)
    await page.getByRole('button', { name: t.label, exact: true }).first().click().catch(() => {})
    await page.waitForTimeout(500)
    await clickOnCanvas(page, t.at)
    await page.waitForTimeout(BEAT)
  }

  // --- B -------------------------------------------------------------------
  await say(
    page,
    'B · Material brush',
    'Paint a finish onto something already drawn. Pick the material first, in the Materials panel.',
  )
  await page.getByRole('button', { name: 'Material brush', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await say(
    page,
    'With no material chosen it does nothing, silently',
    'No message, no cursor change. If the brush seems dead, that is why.',
  )
  await clickOnCanvas(page, { x: 0.5, y: 0.5 })
  await page.waitForTimeout(BEAT * 2)

  await say(page, 'Choose one first, then paint', 'Materials panel on the left, then click the object.')
  await page.getByText('Materials', { exact: true }).first().click()
  await page.waitForTimeout(BEAT)
  await page.getByText(/PebbleTec|Plaster|Glass/i).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)
  await page.getByRole('button', { name: 'Material brush', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await clickOnCanvas(page, { x: 0.5, y: 0.5 })
  await page.waitForTimeout(BEAT * 2)

  // --- M -------------------------------------------------------------------
  await say(
    page,
    'M · Measure',
    'Click once for the start, once for the end. A third click starts a new measurement, Escape clears it.',
  )
  await page.getByRole('button', { name: 'Measure', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await clickOnCanvas(page, { x: 0.32, y: 0.72 })
  await page.waitForTimeout(BEAT)
  await clickOnCanvas(page, { x: 0.68, y: 0.72 })
  await page.waitForTimeout(BEAT * 2)
  await say(page, 'Escape clears the line', '')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  // --- T -------------------------------------------------------------------
  await say(
    page,
    'T · Annotation',
    'Click where the note should sit, then type it. For things the drawing cannot show, like "tie into existing drain".',
  )
  await page.getByRole('button', { name: 'Annotation', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await clickOnCanvas(page, { x: 0.55, y: 0.35 })
  await page.waitForTimeout(BEAT * 2)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(BEAT)

  // --- C -------------------------------------------------------------------
  await say(
    page,
    'C · Comment',
    'This one is not built. It is on the toolbar with a shortcut, and clicking the canvas writes a line to the browser console.',
  )
  await page.getByRole('button', { name: 'Comment', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(500)
  await clickOnCanvas(page, { x: 0.45, y: 0.5 })
  await page.waitForTimeout(BEAT * 2)

  await say(
    page,
    'Ten buttons, seven that place or measure something',
    'Move, pool shape, steps, water feature, lights, deck, brush, measure, annotation. And Comment, which is a placeholder.',
  )
  await page.waitForTimeout(BEAT * 2)
})
