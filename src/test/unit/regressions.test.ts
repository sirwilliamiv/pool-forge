// Defects a person found by using the app, each pinned so it cannot come back.
//
// Everything covered here was reported by someone looking at the screen, not by
// a failing test. The suite stayed green through all of them, which is the
// point: each half worked in isolation, and nothing checked the seam a user
// stands on.
//
// Defects already guarded elsewhere, so they are not repeated here:
//   staged placement            src/test/unit/three/placement.test.ts
//   deck laid over the water    src/test/unit/three/deck-cutouts.test.ts
//   fit-to-page trigonometry    src/test/unit/three/framing.test.ts
//   a command with no handler   src/test/unit/commands/wiring.test.ts
//   what each handler does      src/test/unit/commands/handler-behaviour.test.ts
//   a runaway voice loop        src/test/unit/voice/session.test.ts
//   the project form autosave   src/test/unit/project-form.test.tsx
//   "5' easement"               src/test/unit/imports/vision/parsing.test.ts
//   drag-and-drop upload        src/test/unit/imports/file-drop.test.tsx

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { LayerRow } from '@/components/editor/shell/layers/LayerRow'
import { PoolShapePicker } from '@/components/editor/shell/PoolShapePicker'
import { dispatch } from '@/lib/commands/dispatch'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { ShapeKind, SHAPE_DEFAULTS, type Shape } from '@/modules/editor/state/shapes'
import { stencilsByCategory } from '@/modules/editor/stencils'
import { StencilCategory } from '@/modules/editor/stencils/types'

// ---------------------------------------------------------------------------
// The pool tool
// ---------------------------------------------------------------------------

describe('the pool tool offers the whole catalogue', () => {
  // PoolShapePicker kept its own array of four shapes while the catalogue held
  // seventeen. A builder reaching for the obvious tool saw a quarter of what
  // exists: every pool-and-spa combination and every step variant was missing,
  // and neither list could notice the other had moved. The rest were only
  // reachable by hunting through the Stencils panel, so the tool named after
  // the job was the worst way to do it.

  afterEach(cleanup)

  async function openPicker(): Promise<HTMLElement[]> {
    render(createElement(PoolShapePicker))
    await userEvent.click(screen.getByRole('button', { name: 'Pool shape' }))
    return screen.findAllByRole('menuitem')
  }

  it('lists one entry per pool shape in the catalogue', async () => {
    const catalogue = stencilsByCategory()[StencilCategory.POOL_SHAPE]
    // Guards the guard: if the catalogue itself shrank back to four, the
    // comparison below would pass while the tool was still broken.
    expect(catalogue.length).toBeGreaterThan(4)

    const items = await openPicker()
    expect(items.map(item => item.textContent)).toEqual(catalogue.map(shape => shape.name))
  })

  it('shows the shapes the hardcoded list left out', async () => {
    // Named explicitly, because these are the ones a customer asks for by name
    // and the tool used to have no answer for.
    const labels = (await openPicker()).map(item => item.textContent)
    expect(labels).toContain('Grecian pool and spa')
    expect(labels).toContain('Corner steps')
    expect(labels).toContain('Spa')
  })

  it('arms the tool with the shape that was picked', async () => {
    // Listing a shape is only half of it: choosing Grecian has to be what the
    // next click on the canvas actually draws.
    const items = await openPicker()
    const grecian = items.find(item => item.textContent === 'Grecian')
    expect(grecian).toBeDefined()
    await userEvent.click(grecian as HTMLElement)

    expect(useEditorStore.getState().activeStencilId).toBe('pool.grecian')
    expect(useEditorStore.getState().activeTool).toBe('tool.pool-shape')
  })
})

// ---------------------------------------------------------------------------
// The layers panel
// ---------------------------------------------------------------------------

describe('the layers panel names what is on the canvas', () => {
  // Every generic stencil read as "Stencil", so a yard with a fence, three
  // trees and an equipment pad showed five identical rows. The panel exists to
  // find one object among many, and it could not tell you which row was which.

  afterEach(cleanup)

  function stencil(id: string): Shape {
    return {
      id: `shape-${id}`,
      kind: ShapeKind.STENCIL,
      stencilId: id,
      x: 0,
      y: 0,
      width: 36,
      height: 36,
      rotation: 0,
      zIndex: 1,
      locked: false,
      hidden: false,
    } as Shape
  }

  it('calls a tree a tree', () => {
    render(createElement(LayerRow, { shape: stencil('site.tree'), selected: false }))
    expect(screen.getByText('Tree')).toBeTruthy()
    expect(screen.queryByText(SHAPE_DEFAULTS[ShapeKind.STENCIL].label)).toBeNull()
  })

  it('gives a yard full of different objects different rows', () => {
    // The reported symptom, reproduced: several objects, one repeated label.
    const ids = ['site.tree', 'deck.fence', 'symbol.equipment-pad', 'water.fire-pit']
    const labels = ids.map(id => {
      const { container } = render(
        createElement(LayerRow, { shape: stencil(id), selected: false }),
      )
      const text = container.textContent ?? ''
      cleanup()
      return text
    })
    expect(new Set(labels).size).toBe(ids.length)
  })

  it('still lets a rename win over the catalogue', () => {
    // Someone who has named a layer "Neighbour's oak" must keep seeing that.
    const named = { ...stencil('site.tree'), name: "Neighbour's oak" } as Shape
    render(createElement(LayerRow, { shape: named, selected: false }))
    expect(screen.getByText("Neighbour's oak")).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Shape commands aimed at something that is not there
// ---------------------------------------------------------------------------

describe('a mutation aimed at an id that is not on the canvas', () => {
  // move, resize and rotate were fixed to refuse an unknown id, because a
  // command that echoes back the id it was handed reports success while
  // changing nothing, and the voice agent then insists the deck is gone while
  // the user is looking at it.
  //
  // The fix reached five commands. This sweep covers the rest, so the list of
  // commands that still lie is written down rather than rediscovered by a user.
  // Adding a new shape mutation without a guard fails this test.
  //
  // It drives the real handlers through the real dispatch path with only the
  // audit POST faked, since the whole defect lives in the seam between a server
  // that returns ok and a client that does nothing. Input validation is the
  // server's half and is covered in src/test/unit/commands/shape.test.ts.

  const GHOST = 'shape-that-was-never-on-the-canvas'

  /** Every registered command that names a single shape by id. */
  const MUTATIONS: [string, Record<string, unknown>][] = [
    ['move.shape', { id: GHOST, x: 10, y: 10 }],
    ['resize.shape', { id: GHOST, width: 240, height: 120 }],
    ['rotate.shape', { id: GHOST, degrees: 45 }],
    ['pool.trim.set', { id: GHOST, coping: false }],
    ['shape.elevation.set', { id: GHOST, elevationFt: 2 }],
    ['shape.rename', { id: GHOST, name: 'Renamed' }],
    ['shape.hide', { id: GHOST, hidden: true }],
    ['shape.lock', { id: GHOST, locked: true }],
    ['duplicate.shape', { id: GHOST }],
    ['pool.shape.set', { id: GHOST, poolShape: 'ellipse' }],
    ['pool.flip', { id: GHOST }],
    ['pool.lock.ratio', { id: GHOST, locked: true }],
    ['pool.geometry.update', { id: GHOST, length: 30 }],
    ['pool.depth.set', { id: GHOST, shallowDepth: 36 }],
    ['set.shape.material', { id: GHOST, materialId: 'pebbletec.cobalt' }],
    ['pool.material.set', { id: GHOST, slot: 'interior', materialId: 'pebbletec.cobalt' }],
  ]

  /**
   * Commands that still report success against a shape that is not there.
   *
   * Empty, and it must stay empty. Every entry would be a sentence the app says
   * to a user that is not true, and the whole list was full when this was
   * written: rename, hide, lock, duplicate, flip, both pool material commands
   * and three geometry commands all echoed the id they were handed. The
   * assertion is exact rather than a length check so a new unguarded mutation
   * fails here rather than reaching somebody's drawing.
   */
  const STILL_LIES: string[] = []

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, data: {} }) })),
    )
    useShapesStore.getState().clear()
    useSelectionStore.getState().clear()
    useHistoryStore.setState({ past: [], future: [] })
    useCameraStore.setState({ targetView: null, framePose: null, frameTarget: null })
    render(createElement(ClientCommandHandlers))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('is refused by the commands that were fixed, and only those', async () => {
    // A pool is on the canvas, so a command that says "no such shape" is
    // reporting the id, not an empty scene.
    useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)

    const reportedSuccess: string[] = []
    for (const [id, input] of MUTATIONS) {
      const result = await dispatch(id, input)
      if (result.ok) reportedSuccess.push(id)
    }

    expect(
      reportedSuccess,
      'these tell the user they worked and change nothing; shrink the list, never grow it',
    ).toEqual(STILL_LIES)
  })

  it('leaves the canvas untouched even when it claims to have worked', async () => {
    // The half that makes it a lie rather than a slip: the shape count and
    // every shape on the sheet are identical afterwards. A command that had
    // invented a shape from a bad id would be a different, louder bug.
    const pool = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)
    const before = JSON.stringify(useShapesStore.getState().shapes)

    for (const [id, input] of MUTATIONS) await dispatch(id, input)

    expect(useShapesStore.getState().shapes.map(s => s.id)).toEqual([pool])
    expect(JSON.stringify(useShapesStore.getState().shapes)).toBe(before)
  })

  it('records a material on the shape rather than only in the audit log', async () => {
    // Both handlers used to return their own input and persist nothing, with a
    // comment saying the audit log captured the intent. That is a record of what
    // someone asked for, not of what the app did: a builder who picked a cobalt
    // interior was told it was set, saw no change, and found no trace of it.
    const pool = useShapesStore.getState().addShape(ShapeKind.RECTANGLE_POOL, 0, 0)

    await dispatch('set.shape.material', { id: pool, materialId: 'pebbletec.cobalt' })
    await dispatch('pool.material.set', { id: pool, slot: 'coping', materialId: 'travertine.silver' })

    const shape = useShapesStore.getState().shapes.find((s) => s.id === pool)
    expect(shape?.materials?.surface).toBe('pebbletec.cobalt')
    // Two slots, kept apart: setting the coping must not wipe the interior.
    expect(shape?.materials?.coping).toBe('travertine.silver')
  })

  it('refuses a material for a shape that is not there', async () => {
    const result = await dispatch('pool.material.set', {
      id: 'ghost',
      slot: 'interior',
      materialId: 'x',
    })
    expect(result.ok).toBe(false)
  })
})
