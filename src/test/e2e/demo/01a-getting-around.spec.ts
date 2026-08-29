import { test } from '@playwright/test'

import {
  BEAT,
  canvasBox,
  chapter,
  dismissOverlays,
  login,
  openEditor,
  say,
} from './_demo'

// Moving the camera, which is the first thing anybody has to do and the one
// thing nothing on screen explains.
//
// Left drag orbits. In most design tools left drag draws a selection box, so
// the first time somebody tries to select two objects the whole yard swings
// round instead, and the app looks broken rather than different. Panning is on
// the right button or shift, and neither is written anywhere.
//
// This chapter says each gesture out loud before doing it, slowly, one at a
// time. Every modifier in `resolveDragMode` and the wheel handler appears here,
// so if a gesture changes and this chapter is not updated, the recording is
// wrong in a way somebody will notice.

// Longer than the five minutes every other chapter gets. This one holds each
// gesture on screen long enough to copy, which is the whole point of it, and
// there are eleven of them.
test.setTimeout(9 * 60_000)

test('01a · getting around', async ({ page }) => {
  await login(page)
  await openEditor(page)
  await dismissOverlays(page)

  await chapter(
    page,
    '01a',
    'Getting around',
    'Orbit, pan, zoom, and the three views. Nothing on screen explains these yet, so here they are.',
  )

  const box = await canvasBox(page)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  // --- orbit ---------------------------------------------------------------
  await say(
    page,
    'Drag with the left button to orbit',
    'This is the one that surprises people. Left drag swings the camera around the yard, it does not draw a selection box.',
  )
  await slowDrag(page, cx, cy, cx + 300, cy + 40)
  await page.waitForTimeout(BEAT)
  await slowDrag(page, cx, cy, cx - 260, cy - 60)
  await page.waitForTimeout(BEAT)

  await say(page, 'Dragging down tips the camera over the top', 'It stops short of going upside down.')
  await slowDrag(page, cx, cy, cx, cy + 220)
  await page.waitForTimeout(BEAT)
  await slowDrag(page, cx, cy, cx, cy - 160)

  // --- pan -----------------------------------------------------------------
  await say(
    page,
    'Hold Shift and drag to pan',
    'Slides the yard sideways instead of rotating it. The right mouse button does the same thing.',
  )
  await page.keyboard.down('Shift')
  await slowDrag(page, cx, cy, cx + 240, cy)
  await page.keyboard.up('Shift')
  await page.waitForTimeout(BEAT)

  await say(page, 'Right button drags pan too', 'Whichever hand you already have on the mouse.')
  await slowDrag(page, cx, cy, cx - 200, cy + 90, 'right')
  await page.waitForTimeout(BEAT)

  // --- zoom ----------------------------------------------------------------
  await say(page, 'Scroll to zoom', 'Scroll up to come in, down to pull back. Both ends stop.')
  await page.mouse.move(cx, cy)
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, -110)
    await page.waitForTimeout(90)
  }
  await page.waitForTimeout(BEAT)
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 110)
    await page.waitForTimeout(90)
  }
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Command and scroll pans up and down',
    'Shift and scroll pans left and right. Useful on a trackpad, where there is no right button under your finger.',
  )
  await page.keyboard.down('Meta')
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 90)
    await page.waitForTimeout(90)
  }
  await page.keyboard.up('Meta')
  await page.waitForTimeout(BEAT)

  // --- getting un-lost -----------------------------------------------------
  await say(
    page,
    'Lost? Press Fit',
    'Bottom right. It frames everything you have drawn, whatever you did to the camera. The 0 key does the same.',
  )
  await page.getByRole('button', { name: /fit everything in view/i }).click().catch(() => {})
  await page.waitForTimeout(BEAT * 2)

  // --- view cube -----------------------------------------------------------
  await say(
    page,
    'The cube snaps to a fixed angle',
    'Top looks straight down. Front, Left and Right look side on. Iso is the three-quarter view you start in.',
  )
  for (const face of ['top', 'front', 'right', 'iso']) {
    await page
      .getByRole('button', { name: new RegExp(`snap camera to ${face} view`, 'i') })
      .click()
      .catch(() => {})
    await say(page, `Cube: ${face.toUpperCase()}`, '')
    await page.waitForTimeout(BEAT)
  }

  // --- the two things both called Plan -------------------------------------
  await say(
    page,
    'Careful: two different controls say "Plan"',
    'Bottom left switches the camera. Top centre switches what the drawing is dressed as. They are not the same control.',
  )
  await page.waitForTimeout(BEAT)

  await say(page, 'Bottom left: Plan, 3D, Section', 'Plan is a flat overhead. Section cuts through the pool.')
  for (const tab of ['Plan', '3D', 'Section']) {
    await page.getByRole('button', { name: tab, exact: true }).first().click().catch(() => {})
    await say(page, `View: ${tab}`, tab === 'Plan' ? 'Flat and square on. In this view a drag always pans, never orbits.' : '')
    await page.waitForTimeout(BEAT)
  }
  await page.getByRole('button', { name: '3D', exact: true }).first().click().catch(() => {})
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Top centre: Plan, Design, Build, Customer',
    'Same drawing, different dressing. Build shows rebar and the gas line. Customer is what you turn the laptop round to show.',
  )
  for (const mode of ['Plan', 'Design', 'Build', 'Customer']) {
    await page.getByRole('button', { name: mode, exact: true }).last().click().catch(() => {})
    await say(page, `Mode: ${mode}`, '')
    await page.waitForTimeout(BEAT)
  }

  await say(
    page,
    'That is the whole camera',
    'Left drag orbits, Shift or right drag pans, scroll zooms, Fit rescues you. Everything else is a shortcut for those.',
  )
  await page.waitForTimeout(BEAT * 2)
})

/**
 * A drag slow enough to watch.
 *
 * `dragOnCanvas` works in fractions of the canvas and moves in twelve steps,
 * which is right for placing something and too quick to follow when the point
 * of the shot is the gesture itself.
 */
async function slowDrag(
  page: import('@playwright/test').Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  button: 'left' | 'right' = 'left',
): Promise<void> {
  await page.mouse.move(fromX, fromY)
  await page.mouse.down({ button })
  const steps = 26
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(fromX + ((toX - fromX) * i) / steps, fromY + ((toY - fromY) * i) / steps)
    await page.waitForTimeout(18)
  }
  await page.mouse.up({ button })
  await page.waitForTimeout(500)
}
