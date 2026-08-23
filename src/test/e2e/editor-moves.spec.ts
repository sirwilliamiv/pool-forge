import { expect, test, type Locator, type Page } from '@playwright/test'

// Every move a builder makes inside the editor, driven through the browser.
//
// `build-a-pool.spec.ts` proves the journey exists. This proves the editor is
// usable once you are in it: select, resize, rename, hide, lock, duplicate,
// delete, zoom, fit, and switch views. Each one is asserted by what shows up on
// screen, because the store being right is not the same claim as the panel
// showing it, and every defect worth catching here lived in that gap.
//
// Where a move has no control at all, the gap is written down as a comment
// instead of being asserted through a store call. A test that reaches past the
// UI to prove a feature "works" is how a missing button stays missing.

const DEMO = { email: 'demo@poolforge.test', password: 'demo1234' }

/** Unique per run, so parallel runs and leftover rows cannot collide. */
const RUN = Math.random().toString(36).slice(2, 8)

test('a builder selects, edits, hides, duplicates and deletes in the editor', async ({ page }) => {
  // The 3D route compiles on demand the first time and it is heavy, and this
  // walks the whole panel surface in one session.
  test.setTimeout(420_000)

  await signIn(page)
  const projectUrl = await createProject(page, `Moves ${RUN}`)

  await page.goto(`${projectUrl}/editor`)
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 180_000 })

  const left = page.locator('aside').first()
  const right = page.locator('aside').last()
  const canvas = page.locator('canvas').first()

  await addStencil(page, 'Standard rectangle')
  const row = left.locator('[role="button"]').filter({ hasText: /rectangle/i }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })

  // ---- select by clicking the pool on the canvas ----
  // Selection through the 3D picker, not through a list row: this is how a
  // builder actually points at a pool, and a picker that misses leaves the
  // inspector empty with nothing on screen to explain why.
  await page.getByRole('button', { name: /fit everything in view/i }).click()
  await page.waitForTimeout(1_000)
  await clickCanvasCentre(page, canvas)

  // The inspector filling in is the visible half of a selection. "No selection"
  // is what every inspector section prints when the pick found nothing.
  await expect(right.getByText('No selection')).toHaveCount(0, { timeout: 15_000 })
  const nameField = right.locator('input').first()
  await expect(nameField).not.toHaveValue('', { timeout: 15_000 })

  // ---- rename it, and see the layers panel agree ----
  // A yard with a fence, three trees and two pads is only navigable if the names
  // a builder types are the names the panel shows.
  const renamed = `Main pool ${RUN}`
  await nameField.fill(renamed)
  await nameField.press('Enter')
  const namedRow = left.locator('[role="button"]').filter({ hasText: renamed }).first()
  await expect(namedRow).toBeVisible({ timeout: 15_000 })

  // ---- resize in the inspector, and see the layers badge follow ----
  // The size badge is the only place a builder can scan every object's
  // dimensions at once, so a badge that lags the inspector means the panel is
  // quietly lying about the drawing.
  const lengthField = geometryFields(right).first()
  await lengthField.fill('30')
  await lengthField.press('Enter')
  await expect(namedRow.getByText(/30'\s*×/)).toBeVisible({ timeout: 15_000 })

  // ---- hide and show ----
  // A hidden layer that cannot be brought back is lost work: the shape is gone
  // from the canvas and only the eye toggle says otherwise.
  await namedRow.click()
  await namedRow.getByRole('button', { name: 'Hide layer' }).click()
  await expect(namedRow.getByRole('button', { name: 'Show layer' })).toBeVisible({
    timeout: 15_000,
  })
  await namedRow.getByRole('button', { name: 'Show layer' }).click()
  await expect(namedRow.getByRole('button', { name: 'Hide layer' })).toBeVisible({
    timeout: 15_000,
  })

  // ---- lock and unlock ----
  // Locking is what stops a finished pool being dragged while decking is drawn
  // around it, so the state has to be readable at a glance and reversible.
  await namedRow.getByRole('button', { name: 'Lock layer' }).click()
  await expect(namedRow.getByRole('button', { name: 'Unlock layer' })).toBeVisible({
    timeout: 15_000,
  })
  await namedRow.getByRole('button', { name: 'Unlock layer' }).click()
  await expect(namedRow.getByRole('button', { name: 'Lock layer' })).toBeVisible({
    timeout: 15_000,
  })

  // ---- duplicate ----
  // Two lights, two benches, two spas: duplicating is faster than placing, and
  // it is only useful if the copy is a real row that can be moved and priced.
  await namedRow.click()
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  const copies = left.locator('[role="button"]').filter({ hasText: renamed })
  await expect(copies).toHaveCount(2, { timeout: 15_000 })

  // ---- zoom in and out with the wheel ----
  // The only zoom a builder can reach (see the gap note at the bottom of this
  // file). Proved on screen by the selection label, which is re-projected from
  // the 3D scene every frame: if the camera did not move, it does not move.
  await left.locator('[role="button"]').filter({ hasText: renamed }).first().click()
  const label = page.getByText(/^Pool — Rectangle$/).first()
  await expect(label).toBeVisible({ timeout: 15_000 })

  const beforeZoom = await labelPosition(label)
  await wheelOverCanvas(page, canvas, -400)
  const zoomedIn = await expectLabelToMove(label, beforeZoom)
  await wheelOverCanvas(page, canvas, 400)
  await expectLabelToMove(label, zoomedIn)

  // ---- fit to page ----
  // An object staged off to the side of the drawing can otherwise only be found
  // by panning for it, which is how a placed stencil reads as a no-op.
  await page.getByRole('button', { name: /fit everything in view/i }).click()
  await page.waitForTimeout(1_000)
  await expect(canvas).toBeVisible()
  await expect(label).toBeVisible({ timeout: 15_000 })

  // ---- switch view tabs ----
  // Plan and Section swap the camera to an orthographic one. Losing the canvas
  // on that swap would blank the drawing, and coming back has to work too.
  for (const view of ['Plan', 'Section', '3D', 'Plan', '3D']) {
    await left.getByRole('tab', { name: view, exact: true }).click()
    await expect(left.getByRole('tab', { name: view, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout: 15_000 },
    )
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 60_000 })
    // The drawing survived the camera swap, not just the canvas element.
    await expect(
      left.locator('[role="button"]').filter({ hasText: renamed }).first(),
    ).toBeVisible({ timeout: 15_000 })
  }

  // ---- switch left panel tabs ----
  // Each tab owns a different part of the job. A tab that renders nothing is
  // invisible to any test that only checks the button highlighted.
  await left.getByRole('button', { name: 'Stencils', exact: true }).click()
  await expect(left.getByPlaceholder(/search stencils/i)).toBeVisible({ timeout: 15_000 })

  await left.getByRole('button', { name: 'Materials', exact: true }).click()
  await expect(left.getByPlaceholder(/search materials/i)).toBeVisible({ timeout: 15_000 })

  await left.getByRole('button', { name: 'Grade', exact: true }).click()
  await expect(left.getByText('Site grading')).toBeVisible({ timeout: 15_000 })

  await left.getByRole('button', { name: 'Layers', exact: true }).click()
  await expect(left.getByText('Sheets')).toBeVisible({ timeout: 15_000 })

  // ---- grading: turn it on, add an elevation, watch cut and fill move ----
  // Earthwork is quoted, so a cut/fill readout that stays at zero after the
  // ground is described is a number going on an invoice that nobody measured.
  await left.getByRole('button', { name: 'Grade', exact: true }).click()
  await left.getByText(/The site is flat/i).waitFor({ timeout: 15_000 })
  await left.locator('input[type="checkbox"]').first().check()
  await expect(left.getByText('Datum (ft)')).toBeVisible({ timeout: 15_000 })
  expect(await earthwork(left), 'a flat site moves no dirt').toEqual({ cut: 0, fill: 0 })

  await left.getByRole('button', { name: 'Add', exact: true }).click()
  const elevation = left.locator('input[aria-label^="Elevation of"]').first()
  await expect(elevation).toBeVisible({ timeout: 15_000 })

  // Existing ground two feet below the finished grade: that is fill, by the
  // cubic yard, and cut has to stay at zero because nothing is being dug out.
  await elevation.fill('-2')
  await expect
    .poll(async () => (await earthwork(left)).fill, {
      message: 'ground two feet low has to read as fill',
      timeout: 15_000,
    })
    .toBeGreaterThan(0)
  expect((await earthwork(left)).cut, 'nothing was dug out').toBe(0)

  // ---- delete ----
  // Left for last on purpose: there is no undo a user can reach (see below), so
  // a delete in this app is permanent.
  await left.getByRole('button', { name: 'Layers', exact: true }).click()
  await left.locator('[role="button"]').filter({ hasText: renamed }).first().click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(left.locator('[role="button"]').filter({ hasText: renamed })).toHaveCount(1, {
    timeout: 15_000,
  })
})

// ---------------------------------------------------------------------------
// GAPS: moves on the brief with no control in the UI to drive them.
//
// UNDO and REDO — MISSING, and this is the serious one. `edit.undo` and
// `edit.redo` are registered commands with working handlers
// (`ClientCommandHandlers.tsx`), and `useHistoryStore` records every mutation,
// but nothing in the browser can reach them:
//   * no button anywhere (header, toolbar, contextual toolbar, view cube),
//   * no command palette row (the palette lists Add / export / validation /
//     camera only),
//   * no key binding. `src/modules/editor/hotkeys/index.ts` maps mod+z and
//     mod+shift+z, but nothing in the app ever reads HOTKEYS — grep it: the
//     array is imported by no component, so no keydown listener exists for it.
//     It also names `history.undo` / `history.redo`, which are not registered
//     command ids at all; the real ones are `edit.undo` / `edit.redo`. So even
//     once someone binds the table, undo will dispatch an unknown command.
// A builder who deletes the wrong pool loses it. That is why the delete case
// above is last in the run, and why nothing here pretends to test undo: the
// only way to make it green today would be to call the store from the test,
// which would assert nothing about what a user can do.
//
// ZOOM BUTTONS — MISSING. Wheel zoom works and is covered above. There is no
// zoom in / zoom out control on screen, and the +/-/0 shortcuts in the hotkey
// table are unbound for the same reason as undo. `canvas.zoom.in` /
// `canvas.zoom.out` have handlers, but they drive `useEditorStore.zoom`, which
// the 3D camera does not read at all, so even a wired button would move
// nothing. The wheel path goes through `CustomOrbit` instead.
//
// RENAMING FROM THE LAYERS PANEL — MISSING. `LayerRow` has no rename control:
// no double-click handler, no inline edit. Renaming only exists in the
// inspector's selection card, which is what the rename case above drives.
//
// Two smaller things found while writing this:
//   * The inspector and the layers panel disagree about what a shape is called
//     before it is renamed. `LayerRow` falls back to the stencil catalogue name
//     ("Standard rectangle"); `SelectionCard` falls back to the shape kind
//     ("Rectangle pool"). Same object, two names, side by side on screen.
//   * `view.set.tab` (Plan / 3D / Section) is dispatched nowhere from the panel
//     — `LeftPanel` calls `setViewMode` on the store directly, bypassing the
//     command registry the repo requires for user-driven actions. The tabs do
//     work, so this test passes; the audit log just never sees them.
// ---------------------------------------------------------------------------

async function signIn(page: Page): Promise<void> {
  await page.goto('/login')
  await page.locator('#email').fill(DEMO.email)
  await page.locator('#password').fill(DEMO.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/dashboard/, { timeout: 60_000 })
}

/** Make a project and return its path. */
async function createProject(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 60_000 })
  await page.getByText(name).first().click()
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })
  return new URL(page.url()).pathname
}

/**
 * Add a stencil from the panel.
 *
 * A click, not a drag: `ToolGestures` abandons placement once the pointer moves
 * more than four pixels, so a drag orbits the camera and creates nothing,
 * silently.
 */
async function addStencil(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /stencils/i }).first().click()
  await page.getByPlaceholder(/search stencils/i).fill(name)
  await page.getByText(name, { exact: false }).first().click()
  await page.waitForTimeout(1_500)
  await page.getByRole('button', { name: /layers/i }).first().click()
}

/** The Geometry section's number fields, in order: L, W, average depth. */
function geometryFields(right: Locator): Locator {
  return right.locator('section:has(h4:text-is("Geometry")) input[type="number"]')
}

/** Click the middle of the canvas, which is where a fitted drawing sits. */
async function clickCanvasCentre(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no box')
  // Down and up in the same place: the picker treats a four pixel move as a
  // camera drag and selects nothing.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await page.waitForTimeout(500)
}

async function wheelOverCanvas(page: Page, canvas: Locator, deltaY: number): Promise<void> {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('canvas has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, deltaY)
  await page.waitForTimeout(800)
}

async function labelPosition(label: Locator): Promise<{ x: number; y: number }> {
  const box = await label.boundingBox()
  if (!box) throw new Error('selection label is not on screen')
  return { x: box.x, y: box.y }
}

/** The label is re-projected from the scene each frame, so it moving is the camera moving. */
async function expectLabelToMove(
  label: Locator,
  from: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  await expect
    .poll(
      async () => {
        const box = await label.boundingBox()
        if (!box) return 0
        return Math.abs(box.x - from.x) + Math.abs(box.y - from.y)
      },
      { message: 'the camera did not move', timeout: 15_000 },
    )
    .toBeGreaterThan(4)
  return labelPosition(label)
}

/** Cut and fill as the panel prints them, in cubic yards. */
async function earthwork(left: Locator): Promise<{ cut: number; fill: number }> {
  const text = await left.innerText()
  const cut = /Cut\s*([\d.]+)\s*yd/.exec(text)?.[1]
  const fill = /Fill\s*([\d.]+)\s*yd/.exec(text)?.[1]
  return { cut: Number(cut ?? NaN), fill: Number(fill ?? NaN) }
}
