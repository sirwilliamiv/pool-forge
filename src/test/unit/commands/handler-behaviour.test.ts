/** @vitest-environment jsdom */

// Does each client command handler actually change the thing it claims to?
//
// `wiring.test.ts` proves every client command has a handler registered. That
// catches the empty seam, but it cannot catch a handler that runs, returns a
// confident-looking payload, and leaves the canvas exactly as it was. That
// failure is worse than a crash: the voice agent is told the work is done, says
// so out loud, and the user is looking at a screen that disagrees. It shipped
// with `edit.undo`, which reported a summary the agent could not act on and sent
// it round the same loop.
//
// So this suite mounts the real component so the real handlers register, sends
// real dispatches through the real registry, and then asserts against the
// Zustand stores. Nothing here checks that a function was called. If a handler
// is gutted to `return input`, every test that covers it fails.

import { createElement } from 'react'

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { dispatch } from '@/lib/commands/dispatch'
import { framingFor } from '@/modules/editor/framing'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useViewStore } from '@/modules/editor/state/viewStore'

// A stencil whose catalogue entry names a dedicated ShapeKind, and one that
// stays a generic STENCIL. The two take different branches through `add.shape`,
// and the difference is visible to the agent later in `scene.describe`.
const TYPED_STENCIL = 'feature.sun-shelf'
const GENERIC_STENCIL = 'pool.roman'

// `dispatch` posts to /api/commands and only runs the client half once the
// server half comes back ok. Without this stub every handler below is skipped
// and the whole suite passes while testing nothing.
function stubServerOk(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {} }),
    })),
  )
}

async function run<O>(id: string, input: unknown = {}): Promise<O> {
  const result = await dispatch<unknown, O>(id, input)
  if (!result.ok) throw new Error(`${id} was expected to succeed but said: ${result.error}`)
  return result.data
}

/** For the cases where refusing is the correct behaviour. */
async function runExpectingFailure(id: string, input: unknown): Promise<string> {
  const result = await dispatch<unknown, unknown>(id, input)
  if (result.ok) throw new Error(`${id} succeeded but should have refused`)
  return result.error
}

function shapes(): Shape[] {
  return useShapesStore.getState().shapes
}

function shapeById(id: string): Shape {
  const found = shapes().find((s) => s.id === id)
  if (!found) throw new Error(`no shape ${id}`)
  return found
}

/** Add a shape the way a user would, and hand back its id. */
async function addShape(
  stencilId: string,
  patch: { x?: number; y?: number; width?: number; height?: number } = {},
): Promise<string> {
  const { shapeId } = await run<{ shapeId: string }>('add.shape', {
    stencilId,
    x: patch.x ?? 0,
    y: patch.y ?? 0,
    width: patch.width ?? 120,
    height: patch.height ?? 60,
  })
  return shapeId
}

// Every store is a module singleton, so a leftover shape or a leftover history
// entry from the previous test would make the next one pass or fail for reasons
// that have nothing to do with the handler under test.
function resetStores(): void {
  // hydrate() also clears the undo stack and closes any open drag transaction,
  // which plain setState would leave dangling and let history bleed between
  // tests.
  useShapesStore.getState().hydrate([])
  useHistoryStore.getState().reset()
  useSelectionStore.getState().clear()
  useEditorStore.setState({ zoom: 1, panX: 0, panY: 0, activeTool: 'tool.select' })
  useCameraStore.setState({
    targetView: null,
    transitionToken: 0,
    framePose: null,
    frameTarget: null,
  })
  useViewStore.setState({
    viewMode: '3d',
    presentationMode: 'design',
    leftTab: 'layers',
    rightTab: 'design',
    focusedPanel: null,
    focusNonce: 0,
  })
  useGradeStore.getState().hydrate(null)
  useGradeStore.getState().setEditing('existing')
}

beforeEach(() => {
  resetStores()
  stubServerOk()
  // The handlers register in a useEffect, so nothing is dispatchable until the
  // component is actually mounted.
  render(createElement(ClientCommandHandlers))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('add.shape', () => {
  it('puts a shape on the canvas where it was asked for', async () => {
    const id = await addShape(GENERIC_STENCIL, { x: 100, y: 200, width: 300, height: 144 })

    expect(shapes()).toHaveLength(1)
    const shape = shapeById(id)
    expect(shape.x).toBe(100)
    expect(shape.y).toBe(200)
    expect(shape.width).toBe(300)
    expect(shape.height).toBe(144)
  })

  it('gives a stencil-backed shape the STENCIL kind and keeps its catalogue id', async () => {
    // The stencil id is the only route back to fill colour, pricing behaviour
    // and the human-readable name. Losing it turns a named object into an
    // anonymous box.
    const id = await addShape(GENERIC_STENCIL)
    const shape = shapeById(id)

    expect(shape.kind).toBe(ShapeKind.STENCIL)
    expect('stencilId' in shape ? shape.stencilId : null).toBe(GENERIC_STENCIL)
  })

  it('promotes a stencil that names a dedicated kind', async () => {
    // A sun shelf has its own mesh, its own measurement rule and its own price
    // line. If it landed as a generic STENCIL it would render as a flat symbol
    // and never reach the quote.
    const id = await addShape(TYPED_STENCIL)

    expect(shapeById(id).kind).toBe(ShapeKind.SUN_SHELF)
  })

  it('carries the display hint onto the shape', async () => {
    // The hint is how an oval pool stops being a rectangle. Dropping it on the
    // way in means the shape the user described is not the shape they get.
    const { shapeId } = await run<{ shapeId: string }>('add.shape', {
      stencilId: GENERIC_STENCIL,
      x: 0,
      y: 0,
      displayHint: { poolShape: 'ellipse' },
    })

    expect(shapeById(shapeId).displayHint?.poolShape).toBe('ellipse')
  })
})

describe('move.shape', () => {
  it('moves to an absolute position', async () => {
    const id = await addShape(GENERIC_STENCIL, { x: 10, y: 10 })

    await run('move.shape', { id, x: 400, y: 250 })

    expect(shapeById(id).x).toBe(400)
    expect(shapeById(id).y).toBe(250)
  })

  it('offsets from where the shape already is when relative', async () => {
    // "Nudge it three feet left" is the common spoken form. If relative were
    // treated as absolute the object would jump to the origin instead.
    const id = await addShape(GENERIC_STENCIL, { x: 100, y: 100 })

    await run('move.shape', { id, x: -36, y: 12, relative: true })

    expect(shapeById(id).x).toBe(64)
    expect(shapeById(id).y).toBe(112)
  })

  it('refuses to move a shape that is not there', async () => {
    // Silently succeeding here is the defect that had the agent insisting it
    // had moved a deck the user could see had not moved.
    const error = await runExpectingFailure('move.shape', { id: 'ghost', x: 1, y: 1 })

    expect(error).toContain('ghost')
    expect(shapes()).toHaveLength(0)
  })
})

describe('resize.shape', () => {
  it('writes both dimensions', async () => {
    const id = await addShape(GENERIC_STENCIL, { width: 100, height: 100 })

    await run('resize.shape', { id, width: 360, height: 168 })

    expect(shapeById(id).width).toBe(360)
    expect(shapeById(id).height).toBe(168)
  })

  it('refuses an id that is not on the canvas', async () => {
    const error = await runExpectingFailure('resize.shape', {
      id: 'ghost',
      width: 10,
      height: 10,
    })

    expect(error).toContain('ghost')
  })
})

describe('rotate.shape', () => {
  it('sets an absolute angle', async () => {
    const id = await addShape(GENERIC_STENCIL)

    await run('rotate.shape', { id, degrees: 90 })

    expect(shapeById(id).rotation).toBe(90)
  })

  it('adds to the current angle when relative', async () => {
    // "Turn it another 45 degrees" has to compose, or repeating the instruction
    // parks the object at the same angle forever.
    const id = await addShape(GENERIC_STENCIL)
    await run('rotate.shape', { id, degrees: 30 })

    await run('rotate.shape', { id, degrees: 45, relative: true })

    expect(shapeById(id).rotation).toBe(75)
  })

  it('refuses an id that is not on the canvas', async () => {
    await runExpectingFailure('rotate.shape', { id: 'ghost', degrees: 10 })
  })
})

describe('delete.shape', () => {
  it('removes the shape and names what went', async () => {
    // The name is what gets read back to the user. An id would be unreadable
    // out loud and unverifiable on screen.
    const id = await addShape(TYPED_STENCIL)
    await run('shape.rename', { id, name: 'Tanning ledge' })

    const result = await run<{ deletedIds: string[]; deletedNames: string[]; notFound: string[] }>(
      'delete.shape',
      { ids: [id] },
    )

    expect(shapes()).toHaveLength(0)
    expect(result.deletedIds).toEqual([id])
    expect(result.deletedNames).toEqual(['Tanning ledge'])
    expect(result.notFound).toEqual([])
  })

  it('drops the selection so nothing points at a deleted shape', async () => {
    // A selection holding a dead id makes the inspector render a shape that no
    // longer exists, and the next "resize the selected one" targets nothing.
    const id = await addShape(GENERIC_STENCIL)
    await run('selection.set', { ids: [id] })
    expect(useSelectionStore.getState().selectedIds).toEqual([id])

    await run('delete.shape', { ids: [id] })

    expect(useSelectionStore.getState().selectedIds).toEqual([])
  })

  it('throws when none of the ids exist', async () => {
    // The original bug in full: delete a misremembered id, get an ok back, tell
    // the user the object is gone while they are looking at it.
    const id = await addShape(GENERIC_STENCIL)

    const error = await runExpectingFailure('delete.shape', { ids: ['ghost-1', 'ghost-2'] })

    expect(error).toContain('ghost-1')
    expect(shapes().map((s) => s.id)).toEqual([id])
  })

  it('deletes what it can and reports the rest as missing', async () => {
    const real = await addShape(GENERIC_STENCIL)

    const result = await run<{ deletedIds: string[]; notFound: string[] }>('delete.shape', {
      ids: [real, 'ghost'],
    })

    expect(result.deletedIds).toEqual([real])
    expect(result.notFound).toEqual(['ghost'])
    expect(shapes()).toHaveLength(0)
  })
})

describe('shape.rename, shape.hide, shape.lock', () => {
  it('rename writes the name onto the shape', async () => {
    const id = await addShape(GENERIC_STENCIL)

    await run('shape.rename', { id, name: 'Deep end' })

    expect(shapeById(id).name).toBe('Deep end')
  })

  it('hide flips the flag and takes the shape out of the scene the agent reads', async () => {
    // Hidden has to mean hidden in both places. If the shape stays in
    // scene.describe the agent keeps offering to edit something invisible.
    const id = await addShape(GENERIC_STENCIL)

    await run('shape.hide', { id, hidden: true })

    expect(shapeById(id).hidden).toBe(true)
    const scene = await run<{ count: number }>('scene.describe', {})
    expect(scene.count).toBe(0)
  })

  it('hide can put a shape back', async () => {
    const id = await addShape(GENERIC_STENCIL)
    await run('shape.hide', { id, hidden: true })

    await run('shape.hide', { id, hidden: false })

    expect(shapeById(id).hidden).toBe(false)
  })

  it('lock flips the flag', async () => {
    const id = await addShape(GENERIC_STENCIL)

    await run('shape.lock', { id, locked: true })

    expect(shapeById(id).locked).toBe(true)
  })

  it('refuses a rename aimed at an id that is not there', async () => {
    // rename, hide and lock used to echo the id they were handed, which is the
    // exact lie the other handlers were fixed to stop telling: the voice agent
    // gets a confident copy of its own input and reports the rename as done.
    const id = await addShape(GENERIC_STENCIL)
    const before = shapeById(id).name

    await expect(run<{ id: string; name: string }>('shape.rename', {
      id: 'ghost',
      name: 'Deep end',
    })).rejects.toThrow(/nothing on the canvas/i)

    expect(shapeById(id).name).toBe(before)
    expect(shapes().some((s) => s.name === 'Deep end')).toBe(false)
  })
})

describe('sketch.fill.set', () => {
  /** Draw a closed square outline, the way the freehand tool would. */
  async function addSketch(): Promise<string> {
    const { shapeId } = await run<{ shapeId: string }>('sketch.create', {
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 120 },
        { x: 0, y: 120 },
      ],
      closed: true,
    })
    return shapeId
  }

  it('paints a fill colour onto the shape', async () => {
    const id = await addSketch()

    await run('sketch.fill.set', { id, color: 'blue' })

    expect(shapeById(id)).toMatchObject({ fillColor: 'blue' })
  })

  it('clearing the fill removes the field rather than leaving it undefined', async () => {
    // The regression this guards: updateShape used to merge `{ ...s, ...patch
    // }`, and a patch of `{ fillColor: undefined }` sets that key to
    // undefined instead of deleting it. The shape then carries an own
    // `fillColor` key forever, which is the exact anti-pattern the repo's own
    // conventions (site.limits.set's `delete`, commentsStore's field-by-field
    // rebuild) exist to avoid elsewhere.
    const id = await addSketch()
    await run('sketch.fill.set', { id, color: 'blue' })

    await run('sketch.fill.set', { id, color: 'none' })

    const shape = shapeById(id)
    expect(Object.hasOwn(shape, 'fillColor')).toBe(false)
    expect('fillColor' in shape).toBe(false)
  })

  it('refuses an open path, which has no inside', async () => {
    const { shapeId } = await run<{ shapeId: string }>('sketch.create', {
      points: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
      ],
      closed: false,
    })

    await expect(
      run('sketch.fill.set', { id: shapeId, color: 'blue' }),
    ).rejects.toThrow(/no inside/i)

    expect(Object.hasOwn(shapeById(shapeId), 'fillColor')).toBe(false)
  })
})

describe('selection.set', () => {
  it('replaces the selection with the ids given', async () => {
    const a = await addShape(GENERIC_STENCIL)
    const b = await addShape(GENERIC_STENCIL, { x: 300 })
    await run('selection.set', { ids: [a] })

    await run('selection.set', { ids: [b] })

    expect(useSelectionStore.getState().selectedIds).toEqual([b])
  })

  it('an empty list clears the selection', async () => {
    // "Deselect everything" is a real instruction, and selectMany([]) and
    // clear() have to end up in the same place or the inspector stays open on a
    // shape nobody has selected.
    const id = await addShape(GENERIC_STENCIL)
    await run('selection.set', { ids: [id] })
    expect(useSelectionStore.getState().selectedIds).toEqual([id])

    await run('selection.set', { ids: [] })

    expect(useSelectionStore.getState().selectedIds).toEqual([])
  })
})

describe('canvas.zoom.in and canvas.zoom.out', () => {
  it('zoom in raises the zoom factor', async () => {
    // This one was registered, offered to the agent, reported success, and did
    // nothing at all in a live session.
    const result = await run<{ zoom: number }>('canvas.zoom.in', {})

    expect(useEditorStore.getState().zoom).toBeCloseTo(1.2, 5)
    expect(result.zoom).toBeCloseTo(1.2, 5)
  })

  it('zoom in honours a custom step', async () => {
    await run('canvas.zoom.in', { step: 2 })

    expect(useEditorStore.getState().zoom).toBeCloseTo(2, 5)
  })

  it('zoom out lowers the zoom factor', async () => {
    await run('canvas.zoom.out', {})

    expect(useEditorStore.getState().zoom).toBeCloseTo(1 / 1.2, 5)
  })

  it('zoom out stops at the floor instead of running to zero', async () => {
    // Past the clamp the drawing would vanish and no amount of zooming in from
    // a sane step would bring it back in a reasonable number of calls.
    for (let i = 0; i < 40; i += 1) await run('canvas.zoom.out', {})

    expect(useEditorStore.getState().zoom).toBeCloseTo(0.1, 5)
  })
})

describe('canvas.pan', () => {
  it('accumulates offsets rather than replacing them', async () => {
    // Panning is inherently repeated. If each call reset the origin, "a bit
    // further left" would land in the same place every time.
    await run('canvas.pan', { dx: 40, dy: -20 })

    const result = await run<{ panX: number; panY: number }>('canvas.pan', { dx: 10, dy: 5 })

    expect(useEditorStore.getState().panX).toBe(50)
    expect(useEditorStore.getState().panY).toBe(-15)
    expect(result).toEqual({ panX: 50, panY: -15 })
  })

  it('treats a missing axis as no movement on that axis', async () => {
    await run('canvas.pan', { dx: 25 })

    expect(useEditorStore.getState().panX).toBe(25)
    expect(useEditorStore.getState().panY).toBe(0)
  })
})

describe('canvas.fit', () => {
  it('points the camera at everything on the canvas', async () => {
    // "Show me everything" reported success and moved nothing for a long time,
    // which left an object staged off to the side unreachable.
    await addShape(GENERIC_STENCIL, { x: 0, y: 0, width: 100, height: 100 })
    await addShape(GENERIC_STENCIL, { x: 600, y: 400, width: 100, height: 100 })
    const tokenBefore = useCameraStore.getState().transitionToken

    await run('canvas.fit', {})

    const camera = useCameraStore.getState()
    expect(camera.framePose).not.toBeNull()
    expect(camera.targetView).toBeNull()
    expect(camera.transitionToken).toBeGreaterThan(tokenBefore)
    expect(camera.frameTarget).toEqual(
      framingFor({ x: 0, y: 0, width: 700, height: 500 }).target,
    )
  })

  it('leaves hidden shapes out of the box it frames', async () => {
    // Otherwise hiding an object to get it out of the way would still drag the
    // camera halfway across the site to include it.
    await addShape(GENERIC_STENCIL, { x: 0, y: 0, width: 100, height: 100 })
    const far = await addShape(GENERIC_STENCIL, { x: 5000, y: 5000, width: 100, height: 100 })
    await run('shape.hide', { id: far, hidden: true })

    await run('canvas.fit', {})

    expect(useCameraStore.getState().frameTarget).toEqual(
      framingFor({ x: 0, y: 0, width: 100, height: 100 }).target,
    )
  })

  it('falls back to the iso view on an empty canvas', async () => {
    // There is no box to frame, and leaving the camera untouched would make the
    // command look broken on a fresh drawing.
    await run('canvas.fit', {})

    expect(useCameraStore.getState().targetView).toBe('iso')
    expect(useCameraStore.getState().framePose).toBeNull()
  })
})

describe('view.set.tab', () => {
  it('switches the canvas between plan, 3d and section', async () => {
    await run('view.set.tab', { tab: 'plan' })
    expect(useViewStore.getState().viewMode).toBe('plan')

    await run('view.set.tab', { tab: 'section' })
    expect(useViewStore.getState().viewMode).toBe('section')
  })

  it('does not disturb the presentation mode', async () => {
    // The two look similar in the payload and both live on the view store, so a
    // handler writing the wrong field would still appear to work.
    await run('mode.set.presentation', { mode: 'customer' })

    await run('view.set.tab', { tab: 'plan' })

    expect(useViewStore.getState().presentationMode).toBe('customer')
  })
})

describe('mode.set.presentation', () => {
  it('sets the presentation mode', async () => {
    // This is what a homeowner sees when the laptop gets turned around, so it
    // failing quietly happens in front of the customer.
    await run('mode.set.presentation', { mode: 'customer' })

    expect(useViewStore.getState().presentationMode).toBe('customer')
  })

  it('does not disturb the canvas tab', async () => {
    await run('view.set.tab', { tab: 'plan' })

    await run('mode.set.presentation', { mode: 'build' })

    expect(useViewStore.getState().viewMode).toBe('plan')
  })
})

describe('edit.undo and edit.redo', () => {
  it('undo takes back the shape that was just added', async () => {
    // Undo is the difference between a wrong command being a mistake and being
    // a loss.
    await addShape(GENERIC_STENCIL)
    expect(shapes()).toHaveLength(1)

    await run('edit.undo', {})

    expect(shapes()).toHaveLength(0)
  })

  it('undo reports the canvas it left behind, not the request it was given', async () => {
    // The regression that started this file: undo ran, returned a summary with
    // nothing checkable in it, and the agent could not tell whether it had
    // worked, so it called undo again and again.
    await addShape(GENERIC_STENCIL)

    const result = await run<{ undone: boolean; shapeCount: number }>('edit.undo', {})

    expect(result.undone).toBe(true)
    expect(result.shapeCount).toBe(0)
    expect(result.shapeCount).toBe(shapes().length)
  })

  it('undo with nothing to undo says so and leaves the canvas alone', async () => {
    // If it claimed success the agent would keep unwinding a stack that is not
    // there rather than telling the user there is nothing to take back.
    const id = await addShape(GENERIC_STENCIL)
    useHistoryStore.getState().reset()

    const result = await run<{ undone: boolean; shapeCount: number }>('edit.undo', {})

    expect(result.undone).toBe(false)
    expect(result.shapeCount).toBe(1)
    expect(shapes().map((s) => s.id)).toEqual([id])
  })

  it('undo steps back one edit at a time', async () => {
    const id = await addShape(GENERIC_STENCIL, { x: 0, y: 0 })
    await run('move.shape', { id, x: 500, y: 500 })

    await run('edit.undo', {})

    expect(shapes()).toHaveLength(1)
    expect(shapeById(id).x).toBe(0)
  })

  it('redo puts back what undo removed', async () => {
    const id = await addShape(GENERIC_STENCIL)
    await run('edit.undo', {})

    const result = await run<{ redone: boolean; shapeCount: number }>('edit.redo', {})

    expect(result.redone).toBe(true)
    expect(result.shapeCount).toBe(1)
    expect(shapes().map((s) => s.id)).toEqual([id])
  })

  it('redo with an empty future says so', async () => {
    await addShape(GENERIC_STENCIL)

    const result = await run<{ redone: boolean; shapeCount: number }>('edit.redo', {})

    expect(result.redone).toBe(false)
    expect(shapes()).toHaveLength(1)
  })
})

describe('pool.trim.set', () => {
  it('turns the coping off on the shape itself', async () => {
    // Coping and waterline tile are part of the pool mesh, so this flag is the
    // only way to remove them. An echo without a write means the render never
    // changes.
    const id = await addShape('pool.rectangle')

    await run('pool.trim.set', { id, coping: false })

    expect(shapeById(id).displayHint?.coping).toBe(false)
  })

  it('leaves the other trim alone when only one is named', async () => {
    // Absent means present. Writing both every time would silently switch the
    // tile band back on whenever someone asked about coping.
    const id = await addShape('pool.rectangle')
    await run('pool.trim.set', { id, tileBand: false })

    await run('pool.trim.set', { id, coping: false })

    expect(shapeById(id).displayHint?.tileBand).toBe(false)
    expect(shapeById(id).displayHint?.coping).toBe(false)
  })

  it('refuses an id that is not on the canvas', async () => {
    const error = await runExpectingFailure('pool.trim.set', { id: 'ghost', coping: false })

    expect(error).toContain('ghost')
  })
})

describe('shape.elevation.set', () => {
  it('raises the shape off grade', async () => {
    // Without this every raised deck and sunken patio renders at lawn height,
    // which is the one thing a section drawing exists to show.
    const id = await addShape(GENERIC_STENCIL)

    await run('shape.elevation.set', { id, elevationFt: 2.5 })

    expect(shapeById(id).elevationFt).toBe(2.5)
  })

  it('accepts a negative elevation for something sunk into the ground', async () => {
    const id = await addShape(GENERIC_STENCIL)

    await run('shape.elevation.set', { id, elevationFt: -1.5 })

    expect(shapeById(id).elevationFt).toBe(-1.5)
  })

  it('refuses an id that is not on the canvas', async () => {
    const error = await runExpectingFailure('shape.elevation.set', {
      id: 'ghost',
      elevationFt: 1,
    })

    expect(error).toContain('ghost')
  })
})

interface SceneShape {
  id: string
  name: string
  kind: string
  stencilId: string | null
  x: number
  y: number
  width: number
  height: number
  rotation: number
  locked: boolean
  hidden: boolean
}

interface Scene {
  count: number
  selectedIds: string[]
  shapes: SceneShape[]
  bounds: { x: number; y: number; width: number; height: number } | null
}

describe('scene.describe', () => {
  it('is the only read in the registry, so it has to carry ids and geometry', async () => {
    // Every other command takes an id. If this returned a count and nothing
    // else the agent could add objects forever and never touch one again.
    const id = await addShape(GENERIC_STENCIL, { x: 24, y: 36, width: 100, height: 50 })

    const scene = await run<Scene>('scene.describe', {})

    expect(scene.count).toBe(1)
    expect(scene.shapes[0]?.id).toBe(id)
    expect(scene.shapes[0]?.x).toBe(24)
    expect(scene.shapes[0]?.y).toBe(36)
    expect(scene.shapes[0]?.width).toBe(100)
    expect(scene.shapes[0]?.height).toBe(50)
  })

  it('reports the extent of the drawing so "next to the pool" has a number behind it', async () => {
    await addShape(GENERIC_STENCIL, { x: 0, y: 0, width: 100, height: 100 })
    await addShape(GENERIC_STENCIL, { x: 200, y: 200, width: 50, height: 50 })

    const scene = await run<Scene>('scene.describe', {})

    expect(scene.bounds).toEqual({ x: 0, y: 0, width: 250, height: 250 })
  })

  it('reports null bounds on an empty canvas rather than a box at the origin', async () => {
    // A zero-size box at 0,0 would read as a real drawing and send the camera
    // somewhere arbitrary.
    const scene = await run<Scene>('scene.describe', {})

    expect(scene.count).toBe(0)
    expect(scene.bounds).toBeNull()
  })

  it('reports what is selected', async () => {
    const id = await addShape(GENERIC_STENCIL)
    await run('selection.set', { ids: [id] })

    const scene = await run<Scene>('scene.describe', {})

    expect(scene.selectedIds).toEqual([id])
  })

  it('leaves hidden shapes out by default and includes them on request', async () => {
    const visible = await addShape(GENERIC_STENCIL, { x: 0 })
    const hidden = await addShape(GENERIC_STENCIL, { x: 400 })
    await run('shape.hide', { id: hidden, hidden: true })

    const byDefault = await run<Scene>('scene.describe', {})
    const withHidden = await run<Scene>('scene.describe', { includeHidden: true })

    expect(byDefault.shapes.map((s) => s.id)).toEqual([visible])
    expect(withHidden.shapes.map((s) => s.id)).toEqual([visible, hidden])
  })

  it('prefers the name the user gave over anything derived', async () => {
    const id = await addShape(GENERIC_STENCIL)
    await run('shape.rename', { id, name: 'Spillover spa' })

    const scene = await run<Scene>('scene.describe', {})

    expect(scene.shapes[0]?.name).toBe('Spillover spa')
  })

  it('falls back to the catalogue name for an unnamed stencil', async () => {
    // So the agent says "Roman" rather than "STENCIL", which is unreadable out
    // loud and tells the user nothing.
    await addShape(GENERIC_STENCIL)

    const scene = await run<Scene>('scene.describe', {})

    expect(scene.shapes[0]?.name).toBe('Roman')
    expect(scene.shapes[0]?.stencilId).toBe(GENERIC_STENCIL)
  })

  it('keeps the catalogue name for a stencil with a dedicated kind', async () => {
    // `defaultsFor` used to write stencilId only in the STENCIL branch, so every
    // shape with its own mesh — a pool, a spa, a sun shelf, a deck — arrived
    // without one and the agent read the raw enum aloud: "SUN_SHELF". Exactly
    // backwards, since those are the objects that carry meshes and price lines.
    await addShape(TYPED_STENCIL)

    const scene = await run<Scene>('scene.describe', {})

    expect(scene.shapes[0]?.stencilId).toBe(TYPED_STENCIL)
    expect(scene.shapes[0]?.name).toBe('Sun shelf')
  })
})

describe('grade.enable', () => {
  it('turns both surfaces on together', async () => {
    // One surface enabled and the other not would report the whole site as cut
    // or fill the instant grading was switched on, and that number goes on the
    // quote.
    await run('grade.enable', { enabled: true })

    expect(useGradeStore.getState().existing.enabled).toBe(true)
    expect(useGradeStore.getState().finished.enabled).toBe(true)
  })

  it('turns both surfaces off together', async () => {
    await run('grade.enable', { enabled: true })
    expect(useGradeStore.getState().existing.enabled).toBe(true)

    await run('grade.enable', { enabled: false })

    expect(useGradeStore.getState().existing.enabled).toBe(false)
    expect(useGradeStore.getState().finished.enabled).toBe(false)
  })
})

describe('grade.point.add', () => {
  it('puts the shot on the surface named in the command', async () => {
    // The surface travels with the command rather than coming from an editing
    // mode, so a spoken instruction cannot be ambiguous about whether it
    // describes the ground as found or as intended.
    const result = await run<{ pointId: string; surface: string; count: number }>(
      'grade.point.add',
      { surface: 'finished', xFt: 10, yFt: 20, elevationFt: 2.5, label: 'NE corner' },
    )

    const grade = useGradeStore.getState()
    expect(grade.finished.points).toHaveLength(1)
    expect(grade.existing.points).toHaveLength(0)
    expect(result.surface).toBe('finished')
    expect(result.count).toBe(1)

    const point = grade.finished.points[0]
    expect(point?.id).toBe(result.pointId)
    expect(point?.x).toBe(120)
    expect(point?.y).toBe(240)
    expect(point?.elevationFt).toBe(2.5)
    expect(point?.label).toBe('NE corner')
    expect(point?.kind).toBe('finished')
  })

  it('switches the editing surface so the panel and the agent agree', async () => {
    // The grade panel writes to whichever surface is being edited. If the
    // command wrote to one and left the panel pointed at the other, the user's
    // next click would land on the wrong ground.
    await run('grade.point.add', { surface: 'finished', xFt: 0, yFt: 0, elevationFt: 1 })

    expect(useGradeStore.getState().editing).toBe('finished')
  })

  it('the first shot switches grading on by itself', async () => {
    // Making someone enable grading separately is a step with no decision in
    // it: adding an elevation is what a person means by "the site is not flat".
    await run('grade.point.add', { surface: 'existing', xFt: 0, yFt: 0, elevationFt: -1 })

    expect(useGradeStore.getState().existing.enabled).toBe(true)
  })

  it('marks a fixed shot so grading cannot move it', async () => {
    // A fixed elevation is a hard constraint like a door threshold. Storing it
    // as an ordinary shot would let the surface solver drift it.
    await run('grade.point.add', {
      surface: 'finished',
      xFt: 10,
      yFt: 10,
      elevationFt: 0,
      fixed: true,
    })

    expect(useGradeStore.getState().finished.points[0]?.kind).toBe('fixed')
  })

  it('accumulates shots rather than replacing the last one', async () => {
    await run('grade.point.add', { surface: 'existing', xFt: 0, yFt: 0, elevationFt: 0 })

    const result = await run<{ count: number }>('grade.point.add', {
      surface: 'existing',
      xFt: 100,
      yFt: 0,
      elevationFt: 1.5,
    })

    expect(useGradeStore.getState().existing.points).toHaveLength(2)
    expect(result.count).toBe(2)
  })
})
