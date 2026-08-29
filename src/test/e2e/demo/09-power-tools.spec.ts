import { test } from '@playwright/test'

import { BEAT, chapter, dismissOverlays, login, note, openEditor, say } from './_demo'

const NAME = '09-power-tools'

test('Chapter 9 — Power tools', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 9',
    'Power tools',
    'The command palette, the shortcuts, and the views. This is how you stop hunting through menus.',
  )

  await openEditor(page)

  await say(
    page,
    'The command palette',
    'Every action in the app is a registered command, and this is the front door to all of them.',
  )
  await page.keyboard.press('Meta+KeyK')
  await page.waitForTimeout(1600)

  const palette = page.locator('[cmdk-root], [role="dialog"]').first()
  if ((await palette.count()) === 0) {
    note(NAME, 'command palette did not open on Cmd+K')
  } else {
    await say(page, 'Search for what you want', 'Type the outcome rather than remembering where the button lives.')
    await page.keyboard.type('pool', { delay: 110 })
    await page.waitForTimeout(1700)
    await say(
      page,
      'Why this matters beyond convenience',
      'Buttons, shortcuts and the palette all dispatch the same command, so anything you can click is also scriptable and auditable.',
    )
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
  }

  await dismissOverlays(page)
  await say(page, 'Single-key tool shortcuts', 'V move, R pool, S steps, W water, L lights, D deck, B brush, M measure, T text.')
  for (const key of ['KeyV', 'KeyR', 'KeyS', 'KeyW', 'KeyL', 'KeyD', 'KeyB', 'KeyM']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(420)
  }
  await page.keyboard.press('KeyV')

  await dismissOverlays(page)
  await say(page, 'Three ways to see the same design', 'Plan, 3D, and Section. One scene, three cameras, never three drawings.')
  for (const view of ['Plan', '3D', 'Section']) {
    // Exact name, and scrolled in first: the switcher sits on the very bottom
    // edge of the viewport, where a click silently waits for actionability.
    const btn = page.getByRole('button', { name: view, exact: true }).first()
    if ((await btn.count()) === 0) {
      note(NAME, `view switch "${view}" not found`)
      continue
    }
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    const ok = await btn.click({ timeout: 8000 }).then(() => true).catch(() => false)
    if (!ok) note(NAME, `view switch "${view}" was present but not clickable`)
    await page.waitForTimeout(1400)
  }

  await say(
    page,
    'Four modes for four jobs',
    'Plan to lay it out, Design to make it look right, Build for the crew, Customer for what the buyer sees.',
  )
  for (const mode of ['Plan', 'Design', 'Build', 'Customer']) {
    const btn = page.getByRole('button', { name: mode, exact: true }).last()
    if ((await btn.count()) === 0) {
      note(NAME, `mode tab "${mode}" not found`)
      continue
    }
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    const ok = await btn.click({ timeout: 8000 }).then(() => true).catch(() => false)
    if (!ok) note(NAME, `mode tab "${mode}" was present but not clickable`)
    await page.waitForTimeout(1400)
  }

  await dismissOverlays(page)
  await say(
    page,
    'The sun study',
    'Time of day against the design, because shade is a selling point and a siting decision.',
  )
  const sun = page.locator('text=/SUN STUDY/i').first()
  if ((await sun.count()) === 0) {
    note(NAME, 'no sun study control in the editor')
  } else {
    const slider = page.locator('input[type="range"]').first()
    if ((await slider.count()) > 0) {
      for (const v of ['20', '55', '85']) {
        await slider.fill(v)
        await page.waitForTimeout(1100)
      }
    }
  }

  await say(page, 'That is the tour', 'Price book, draw, build, materials, measure, quote, documents, and import.')
  await page.waitForTimeout(BEAT)
})
