'use client'

import { useEffect } from 'react'
import { registerClientHandler, unregisterClientHandler } from '@/lib/commands/dispatch'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { cutFillBetween, maxSlope, type SiteGrade } from '@/modules/editor/grade/model'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSunStore } from '@/modules/editor/state/sunStore'
import { useViewStore, type FocusTarget } from '@/modules/editor/state/viewStore'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { framingFor } from '@/modules/editor/framing'
import { visibleBounds } from '@/modules/editor/placement'
import { useCommandPaletteStore } from './shell/CommandPalette'

let sunStudyRaf: number | null = null

/**
 * Fail loudly when a command names a shape that is not there.
 *
 * Every mutation used to echo back the id it was given, so a command against a
 * deleted or misremembered id reported success and changed nothing. The agent
 * then told the user the deck was gone while they were looking at it, three
 * times in a row, and had no way to tell it was wrong.
 */
function requireShape(id: string): void {
  const shape = useShapesStore.getState().shapes.find((s) => s.id === id)
  if (!shape) throw new Error(`There is nothing on the canvas with id ${id}.`)
}

/** Point the camera at the box these shapes occupy. */
function frameShapes(shapes: Shape[]): void {
  const box = visibleBounds(shapes)
  if (!box) return
  const { pose, target } = framingFor(box)
  useCameraStore.getState().frameSelection(pose, target)
}

interface GradeSurfaceDescription {
  baseElevationFt: number
  points: { id: string; x: number; y: number; elevationFt: number; label: string | null }[]
}

interface GradeDescription {
  enabled: boolean
  existing: GradeSurfaceDescription
  finished: GradeSurfaceDescription
  cutYards: number
  fillYards: number
  netYards: number
  reliefFt: number
  maxSlopePct: number
}

/** Ids and labels, so the agent can refer to a shot rather than guess at one. */
function describeSurface(surface: SiteGrade): GradeSurfaceDescription {
  return {
    baseElevationFt: surface.baseElevationFt,
    points: surface.points.map((point) => ({
      id: point.id,
      x: point.x,
      y: point.y,
      elevationFt: point.elevationFt,
      label: point.label ?? null,
    })),
  }
}

interface SceneDescription {
  count: number
  selectedIds: string[]
  shapes: {
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
  }[]
  bounds: { x: number; y: number; width: number; height: number } | null
}

/** The name a person would use, for saying out loud what was removed. */
function defaultLabelFor(shape: Shape): string {
  return nameFor(shape) ?? shape.kind
}

/** Only stencil-backed shapes carry an id; the typed kinds do not. */
function stencilIdOf(shape: Shape): string | undefined {
  return 'stencilId' in shape ? shape.stencilId : undefined
}

/** The catalogue name, so the agent says "sun shelf" rather than "stencil". */
function nameFor(shape: Shape): string | undefined {
  const id = stencilIdOf(shape)
  return id ? getStencil(id)?.name : undefined
}

/** Extent of everything on the canvas, so "around the pool" has a number behind it. */
function boundsOf(
  shapes: { x: number; y: number; width: number; height: number }[],
): SceneDescription['bounds'] {
  const first = shapes[0]
  if (!first) return null
  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height
  for (const shape of shapes) {
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// Single mount point for client-side command handlers. Each command's server
// `execute` records the audit row; the matching handler here applies the
// Zustand mutation. Source of truth is the `// CLIENT:` comment in each
// register({...}) block under src/modules/commands/categories/.

const HANDLER_IDS: string[] = [
  // shape category
  'add.shape',
  'select.shape',
  'move.shape',
  'resize.shape',
  'rotate.shape',
  'delete.shape',
  'duplicate.shape',
  'shape.rename',
  'shape.hide',
  'shape.lock',
  'set.shape.material',
  'pool.geometry.update',
  'pool.material.set',
  'pool.depth.set',
  'pool.flip',
  'pool.lock.ratio',
  'pool.shape.set',
  // canvas category
  'selection.set',
  'camera.set.view',
  'camera.frame.selection',
  'canvas.fit',
  'mode.set.presentation',
  'view.set.tab',
  'tool.activate',
  'scene.describe',
  'set.pool.targetArea',
  'canvas.zoom.in',
  'canvas.zoom.out',
  'canvas.pan',
  'pool.trim.set',
  'edit.undo',
  'edit.redo',
  // grade category
  'grade.enable',
  'grade.point.add',
  'grade.point.update',
  'grade.point.remove',
  'grade.base.set',
  'grade.falloff.set',
  'grade.describe',
  'shape.elevation.set',
  // scene category
  'sun.set.time',
  'sun.run.study',
  // navigation category
  'nav.focus',
  // palette category
  'palette.open',
]

export function ClientCommandHandlers() {
  useEffect(() => {
    // ---------- shape ----------
    registerClientHandler<
      {
        stencilId: string
        x: number
        y: number
        width?: number
        height?: number
        displayHint?: Record<string, unknown>
      },
      { shapeId: string }
    >('add.shape', (input) => {
      const stencil = getStencil(input.stencilId)
      const store = useShapesStore.getState()
      // Stencils with a dedicated ShapeKind get their kind directly so they
      // pick up specific 3D meshes / measurement / pricing behavior. The rest
      // route through addShape(STENCIL, ...) which keeps stencilId on the shape.
      const kind: ShapeKind = (stencil?.shapeKind as ShapeKind | undefined) ?? ShapeKind.STENCIL
      const opts: { stencilId?: string; width?: number; height?: number } = {}
      if (kind === ShapeKind.STENCIL) opts.stencilId = input.stencilId
      else if (stencil) opts.stencilId = input.stencilId
      if (input.width != null) opts.width = input.width
      if (input.height != null) opts.height = input.height
      const shapeId = store.addShape(kind, input.x, input.y, opts)
      if (input.displayHint) {
        store.updateShape(shapeId, { displayHint: input.displayHint })
      }
      return { shapeId }
    })

    registerClientHandler<{ id: string; poolShape: 'rectangle' | 'ellipse' }, { id: string }>(
      'pool.shape.set',
      (input) => {
        requireShape(input.id)
        const store = useShapesStore.getState()
        const shape = store.shapes.find((s) => s.id === input.id)
        store.updateShape(input.id, {
          displayHint: { ...(shape?.displayHint ?? {}), poolShape: input.poolShape },
        })
        return { id: input.id }
      },
    )

    registerClientHandler<{ ids: string[]; additive?: boolean }, { selectedIds: string[] }>(
      'select.shape',
      (input) => {
        if (input.additive) {
          const cur = useSelectionStore.getState().selectedIds
          const merged = Array.from(new Set([...cur, ...input.ids]))
          useSelectionStore.getState().selectMany(merged)
          return { selectedIds: merged }
        }
        useSelectionStore.getState().selectMany(input.ids)
        return { selectedIds: input.ids }
      },
    )

    registerClientHandler<
      { id: string; x: number; y: number; relative?: boolean },
      { id: string; x: number; y: number }
    >('move.shape', (input) => {
      const cur = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      const x = input.relative ? (cur?.x ?? 0) + input.x : input.x
      const y = input.relative ? (cur?.y ?? 0) + input.y : input.y
      requireShape(input.id)
      useShapesStore.getState().updateShape(input.id, { x, y })
      return { id: input.id, x, y }
    })

    registerClientHandler<
      { id: string; width: number; height: number },
      { id: string; width: number; height: number }
    >('resize.shape', (input) => {
      requireShape(input.id)
      useShapesStore
        .getState()
        .updateShape(input.id, { width: input.width, height: input.height })
      return { id: input.id, width: input.width, height: input.height }
    })

    registerClientHandler<
      { id: string; degrees: number; relative?: boolean },
      { id: string; degrees: number }
    >('rotate.shape', (input) => {
      requireShape(input.id)
      const cur = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      const rotation = input.relative ? (cur?.rotation ?? 0) + input.degrees : input.degrees
      useShapesStore.getState().updateShape(input.id, { rotation })
      return { id: input.id, degrees: rotation }
    })

    registerClientHandler<
      { ids: string[] },
      { deletedIds: string[]; deletedNames: string[]; notFound: string[] }
    >(
      'delete.shape',
      (input) => {
        // Report what was actually removed, and by name. Echoing the requested
        // ids meant deleting something that was not there looked identical to
        // deleting something that was, and the agent kept insisting a deck had
        // gone while the user was looking at it.
        const before = useShapesStore.getState().shapes
        const present = before.filter((s) => input.ids.includes(s.id))
        const missing = input.ids.filter((id) => !before.some((s) => s.id === id))

        if (present.length === 0) {
          throw new Error(
            `Nothing on the canvas matches ${input.ids.join(', ')}. Read the scene again before deleting.`,
          )
        }

        useShapesStore.getState().removeShapes(present.map((s) => s.id))
        useSelectionStore.getState().clear()

        return {
          deletedIds: present.map((s) => s.id),
          deletedNames: present.map((s) => s.name ?? defaultLabelFor(s)),
          notFound: missing,
        }
      },
    )

    registerClientHandler<
      { id: string; offsetX?: number; offsetY?: number },
      { sourceId: string; newId: string }
    >('duplicate.shape', (input) => {
      requireShape(input.id)
      const newId = useShapesStore.getState().duplicate(input.id)
      return { sourceId: input.id, newId: newId ?? '' }
    })

    registerClientHandler<{ id: string; name: string }, { id: string; name: string }>(
      'shape.rename',
      (input) => {
        requireShape(input.id)
        useShapesStore.getState().renameShape(input.id, input.name)
        return { id: input.id, name: input.name }
      },
    )

    registerClientHandler<{ id: string; hidden: boolean }, { id: string; hidden: boolean }>(
      'shape.hide',
      (input) => {
        requireShape(input.id)
        useShapesStore.getState().updateShape(input.id, { hidden: input.hidden })
        return { id: input.id, hidden: input.hidden }
      },
    )

    registerClientHandler<{ id: string; locked: boolean }, { id: string; locked: boolean }>(
      'shape.lock',
      (input) => {
        requireShape(input.id)
        useShapesStore.getState().updateShape(input.id, { locked: input.locked })
        return { id: input.id, locked: input.locked }
      },
    )

    registerClientHandler<
      { id: string; materialId: string },
      { id: string; materialId: string }
    >('set.shape.material', (input) => {
      requireShape(input.id)
      const shape = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      useShapesStore.getState().updateShape(input.id, {
        materials: { ...(shape?.materials ?? {}), surface: input.materialId },
      })
      return { id: input.id, materialId: input.materialId }
    })

    registerClientHandler<
      {
        id: string
        lengthFt?: number
        widthFt?: number
        avgDepthFt?: number
        shallowDepthFt?: number
        deepDepthFt?: number
        slope?: number
      },
      { id: string }
    >('pool.geometry.update', (input) => {
      requireShape(input.id)
      const patch: Partial<{
        width: number
        height: number
        depthShallow: number
        depthDeep: number
      }> = {}
      // Feet in, inches on the canvas. The names carry the unit so this
      // conversion cannot be applied twice or not at all.
      if (input.lengthFt != null) patch.width = input.lengthFt * 12
      if (input.widthFt != null) patch.height = input.widthFt * 12
      if (input.shallowDepthFt != null) patch.depthShallow = input.shallowDepthFt
      if (input.deepDepthFt != null) patch.depthDeep = input.deepDepthFt
      // Nothing recognised means nothing to do, and saying "done" to that is
      // the same lie in a new place: Zod strips unknown keys, so a caller using
      // an old field name parses cleanly and carries no values at all.
      if (Object.keys(patch).length === 0) {
        throw new Error(
          'No geometry was given. Use lengthFt, widthFt, shallowDepthFt or deepDepthFt, all in feet.',
        )
      }
      useShapesStore.getState().updateShape(input.id, patch)
      return { id: input.id }
    })

    registerClientHandler<
      { id: string; slot: 'interior' | 'coping' | 'tileBand'; materialId: string },
      { id: string; slot: 'interior' | 'coping' | 'tileBand'; materialId: string }
    >('pool.material.set', (input) => {
      requireShape(input.id)
      const shape = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      useShapesStore.getState().updateShape(input.id, {
        materials: { ...(shape?.materials ?? {}), [input.slot]: input.materialId },
      })
      return { id: input.id, slot: input.slot, materialId: input.materialId }
    })

    registerClientHandler<
      { id: string; axis?: 'x' | 'y' },
      { id: string; flippedX: boolean; flippedY: boolean }
    >('pool.flip', (input) => {
      requireShape(input.id)
      const cur = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      const hint = cur?.displayHint ?? {}
      const flippedX = input.axis === 'y' ? (hint.flippedX ?? false) : !(hint.flippedX ?? false)
      const flippedY = input.axis === 'y' ? !(hint.flippedY ?? false) : (hint.flippedY ?? false)
      useShapesStore
        .getState()
        .updateShape(input.id, { displayHint: { ...hint, flippedX, flippedY } })
      return { id: input.id, flippedX, flippedY }
    })

    registerClientHandler<
      { id: string; locked?: boolean },
      { id: string; lockedRatio: boolean }
    >('pool.lock.ratio', (input) => {
      requireShape(input.id)
      const cur = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      const hint = cur?.displayHint ?? {}
      const lockedRatio = input.locked ?? !(hint.lockedRatio ?? false)
      useShapesStore
        .getState()
        .updateShape(input.id, { displayHint: { ...hint, lockedRatio } })
      return { id: input.id, lockedRatio }
    })

    registerClientHandler<
      {
        id: string
        shallowDepth?: number
        deepDepth?: number
        slope?: number
        sunShelfElevation?: number
        bubblerHeight?: number
      },
      { id: string }
    >('pool.depth.set', (input) => {
      requireShape(input.id)
      const patch: Partial<{ depthShallow: number; depthDeep: number }> = {}
      if (input.shallowDepth != null) patch.depthShallow = input.shallowDepth
      if (input.deepDepth != null) patch.depthDeep = input.deepDepth
      // Nothing recognised means nothing to do, and saying "done" to that is
      // the same lie in a new place: Zod strips unknown keys, so a caller using
      // an old field name parses cleanly and carries no values at all.
      if (Object.keys(patch).length === 0) {
        throw new Error(
          'No geometry was given. Use lengthFt, widthFt, shallowDepthFt or deepDepthFt, all in feet.',
        )
      }
      useShapesStore.getState().updateShape(input.id, patch)
      return { id: input.id }
    })

    // ---------- canvas ----------
    registerClientHandler<{ ids: string[] }, { selectedIds: string[] }>(
      'selection.set',
      (input) => {
        if (input.ids.length === 0) useSelectionStore.getState().clear()
        else useSelectionStore.getState().selectMany(input.ids)
        return { selectedIds: input.ids }
      },
    )

    registerClientHandler<{ target: FocusTarget }, { target: FocusTarget }>(
      'nav.focus',
      (input) => {
        useViewStore.getState().focusPanel(input.target)
        return { target: input.target }
      },
    )

    registerClientHandler<
      { id: string; coping?: boolean; tileBand?: boolean },
      { id: string; coping: boolean; tileBand: boolean }
    >('pool.trim.set', (input) => {
      requireShape(input.id)
      const shape = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      const hint = { ...(shape?.displayHint ?? {}) }
      if (input.coping !== undefined) hint.coping = input.coping
      if (input.tileBand !== undefined) hint.tileBand = input.tileBand
      useShapesStore.getState().updateShape(input.id, { displayHint: hint })
      return { id: input.id, coping: hint.coping !== false, tileBand: hint.tileBand !== false }
    })

    // Undo is the difference between a wrong command being a mistake and being
    // a loss. Without it the agent deleted a pool it was not asked to and could
    // only ask the user whether *they* had an undo button.
    registerClientHandler<unknown, { undone: boolean; shapeCount: number }>('edit.undo', () => {
      const history = useHistoryStore.getState()
      if (!history.canUndo()) return { undone: false, shapeCount: useShapesStore.getState().shapes.length }
      history.undo()
      return { undone: true, shapeCount: useShapesStore.getState().shapes.length }
    })

    registerClientHandler<unknown, { redone: boolean; shapeCount: number }>('edit.redo', () => {
      const history = useHistoryStore.getState()
      if (!history.canRedo()) return { redone: false, shapeCount: useShapesStore.getState().shapes.length }
      history.redo()
      return { redone: true, shapeCount: useShapesStore.getState().shapes.length }
    })

    registerClientHandler<
      { id: string; targetAreaSqft: number },
      { id: string; widthFt: number; lengthFt: number; areaSqft: number }
    >('set.pool.targetArea', (input) => {
      requireShape(input.id)
      const shape = useShapesStore.getState().shapes.find((s) => s.id === input.id)!
      const currentSqft = (shape.width / 12) * (shape.height / 12)
      if (currentSqft <= 0) throw new Error('That shape has no area to scale.')

      // Both sides by the square root, which is the only resize that reaches a
      // target area without changing the pool's proportions. Scaling one side
      // would turn a 2:1 pool into a corridor to hit the same number.
      const factor = Math.sqrt(input.targetAreaSqft / currentSqft)
      const width = shape.width * factor
      const height = shape.height * factor
      useShapesStore.getState().updateShape(input.id, { width, height })

      return {
        id: input.id,
        lengthFt: Math.round((width / 12) * 10) / 10,
        widthFt: Math.round((height / 12) * 10) / 10,
        areaSqft: Math.round((width / 12) * (height / 12) * 10) / 10,
      }
    })

    // ---------- canvas view ----------
    // These were registered, offered to the voice agent, and did nothing. The
    // agent called canvas.zoom.out during a real session, was told it succeeded,
    // and the view never moved.
    registerClientHandler<{ step?: number }, { zoom: number }>('canvas.zoom.in', (input) => {
      const store = useEditorStore.getState()
      store.setZoom(store.zoom * (input.step ?? 1.2))
      return { zoom: useEditorStore.getState().zoom }
    })

    registerClientHandler<{ step?: number }, { zoom: number }>('canvas.zoom.out', (input) => {
      const store = useEditorStore.getState()
      store.setZoom(store.zoom / (input.step ?? 1.2))
      return { zoom: useEditorStore.getState().zoom }
    })

    registerClientHandler<{ dx?: number; dy?: number }, { panX: number; panY: number }>(
      'canvas.pan',
      (input) => {
        const store = useEditorStore.getState()
        store.setPan(store.panX + (input.dx ?? 0), store.panY + (input.dy ?? 0))
        const after = useEditorStore.getState()
        return { panX: after.panX, panY: after.panY }
      },
    )

    // ---------- grade ----------
    registerClientHandler<{ enabled: boolean }, { enabled: boolean }>('grade.enable', (input) => {
      useGradeStore.getState().setEnabled(input.enabled)
      return { enabled: input.enabled }
    })

    registerClientHandler<
      { surface: 'existing' | 'finished'; xFt: number; yFt: number; elevationFt: number; label?: string; fixed?: boolean },
      { pointId: string; surface: string; count: number }
    >('grade.point.add', (input) => {
      const store = useGradeStore.getState()
      // The surface comes with the command rather than from a mode, so a spoken
      // instruction cannot be ambiguous about whether it describes what is there
      // or what is wanted.
      store.setEditing(input.surface)
      const pointId = useGradeStore.getState().addPoint({
        // Feet on the wire, inches in the store, converted in exactly one place.
        x: input.xFt * 12,
        y: input.yFt * 12,
        elevationFt: input.elevationFt,
        kind: input.fixed ? 'fixed' : input.surface,
        ...(input.label ? { label: input.label } : {}),
      })
      return {
        pointId,
        surface: input.surface,
        count: useGradeStore.getState()[input.surface].points.length,
      }
    })

    registerClientHandler<
      { surface: 'existing' | 'finished'; pointId: string; xFt?: number; yFt?: number; elevationFt?: number; label?: string },
      { pointId: string }
    >('grade.point.update', (input) => {
      const store = useGradeStore.getState()
      store.setEditing(input.surface)
      if (!store[input.surface].points.some((p) => p.id === input.pointId)) {
        throw new Error(`There is no elevation with id ${input.pointId} on the ${input.surface} ground.`)
      }
      const patch: Record<string, unknown> = {}
      if (input.xFt !== undefined) patch.x = input.xFt * 12
      if (input.yFt !== undefined) patch.y = input.yFt * 12
      if (input.elevationFt !== undefined) patch.elevationFt = input.elevationFt
      if (input.label !== undefined) patch.label = input.label
      useGradeStore.getState().updatePoint(input.pointId, patch)
      return { pointId: input.pointId }
    })

    registerClientHandler<{ surface: 'existing' | 'finished'; pointId: string }, { pointId: string }>(
      'grade.point.remove',
      (input) => {
        const store = useGradeStore.getState()
        store.setEditing(input.surface)
        if (!store[input.surface].points.some((p) => p.id === input.pointId)) {
          throw new Error(`There is no elevation with id ${input.pointId} to remove.`)
        }
        useGradeStore.getState().removePoint(input.pointId)
        return { pointId: input.pointId }
      },
    )

    registerClientHandler<
      { surface: 'existing' | 'finished'; elevationFt: number },
      { surface: string; elevationFt: number }
    >('grade.base.set', (input) => {
      useGradeStore.getState().setEditing(input.surface)
      useGradeStore.getState().setBaseElevation(input.elevationFt)
      return { surface: input.surface, elevationFt: input.elevationFt }
    })

    registerClientHandler<
      { surface: 'existing' | 'finished'; falloff: number },
      { surface: string; falloff: number }
    >('grade.falloff.set', (input) => {
      useGradeStore.getState().setEditing(input.surface)
      useGradeStore.getState().setFalloff(input.falloff)
      return { surface: input.surface, falloff: useGradeStore.getState()[input.surface].falloff }
    })

    registerClientHandler<unknown, GradeDescription>('grade.describe', () => {
      const { existing, finished } = useGradeStore.getState()
      const bounds = visibleBounds(useShapesStore.getState().shapes) ?? {
        x: -600,
        y: -600,
        width: 1_200,
        height: 1_200,
      }
      const earthwork = cutFillBetween(existing, finished, bounds)
      return {
        enabled: existing.enabled || finished.enabled,
        existing: describeSurface(existing),
        finished: describeSurface(finished),
        cutYards: earthwork.cutYards,
        fillYards: earthwork.fillYards,
        netYards: earthwork.netYards,
        reliefFt: earthwork.reliefFt,
        maxSlopePct: Math.round(maxSlope(finished.enabled ? finished : existing, bounds) * 1000) / 10,
      }
    })

    registerClientHandler<{ id: string; elevationFt: number }, { id: string; elevationFt: number }>(
      'shape.elevation.set',
      (input) => {
        requireShape(input.id)
        useShapesStore.getState().updateShape(input.id, { elevationFt: input.elevationFt })
        return { id: input.id, elevationFt: input.elevationFt }
      },
    )

    // The one read in the registry. Every other command takes an id, so without
    // this the voice agent can add objects forever and never touch one again.
    registerClientHandler<{ includeHidden?: boolean }, SceneDescription>(
      'scene.describe',
      (input) => {
        const all = useShapesStore.getState().shapes
        const shapes = input.includeHidden ? all : all.filter((shape) => !shape.hidden)
        return {
          count: shapes.length,
          selectedIds: useSelectionStore.getState().selectedIds,
          shapes: shapes.map((shape) => ({
            id: shape.id,
            // The name a person would use. An unnamed stencil falls back to the
            // catalogue name rather than the bare kind, so the agent says
            // "sun shelf" instead of "stencil".
            name: shape.name ?? nameFor(shape) ?? shape.kind,
            kind: shape.kind,
            stencilId: stencilIdOf(shape) ?? null,
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            rotation: shape.rotation,
            locked: shape.locked,
            hidden: shape.hidden,
          })),
          bounds: boundsOf(shapes),
        }
      },
    )

    registerClientHandler<
      { view: 'top' | 'front' | 'left' | 'right' | 'iso' },
      { view: 'top' | 'front' | 'left' | 'right' | 'iso' }
    >('camera.set.view', (input) => {
      useCameraStore.getState().setView(input.view)
      return { view: input.view }
    })

    registerClientHandler<unknown, { framed: boolean }>(
      'camera.frame.selection',
      () => {
        const ids = useSelectionStore.getState().selectedIds
        const selected = useShapesStore.getState().shapes.filter((s) => ids.includes(s.id))
        if (selected.length === 0) {
          useCameraStore.getState().setView('iso')
          return { framed: true }
        }
        frameShapes(selected)
        return { framed: true }
      },
    )

    // Fit everything. Registered but never implemented until now, so "show me
    // everything" reported success and moved nothing — and an object staged off
    // to the side of the drawing was unreachable without hunting for it.
    registerClientHandler<unknown, { framed: boolean }>('canvas.fit', () => {
      const shapes = useShapesStore.getState().shapes.filter((s) => !s.hidden)
      if (shapes.length === 0) {
        useCameraStore.getState().setView('iso')
        return { framed: true }
      }
      frameShapes(shapes)
      return { framed: true }
    })

    registerClientHandler<
      { mode: 'plan' | 'design' | 'build' | 'customer' },
      { mode: 'plan' | 'design' | 'build' | 'customer' }
    >('mode.set.presentation', (input) => {
      useViewStore.getState().setPresentationMode(input.mode)
      return { mode: input.mode }
    })

    registerClientHandler<
      { tab: 'plan' | '3d' | 'section' },
      { tab: 'plan' | '3d' | 'section' }
    >('view.set.tab', (input) => {
      useViewStore.getState().setViewMode(input.tab)
      return { tab: input.tab }
    })

    registerClientHandler<{ tool: string }, { tool: string }>('tool.activate', (input) => {
      useEditorStore.getState().setActiveTool(input.tool)
      return { tool: input.tool }
    })

    // ---------- scene ----------
    registerClientHandler<
      { minutesPastMidnight: number },
      { minutesPastMidnight: number }
    >('sun.set.time', (input) => {
      useSunStore.getState().setMinutes(input.minutesPastMidnight)
      return { minutesPastMidnight: input.minutesPastMidnight }
    })

    registerClientHandler<{ durationMs?: number }, { started: boolean }>(
      'sun.run.study',
      (input) => {
        if (sunStudyRaf != null) {
          cancelAnimationFrame(sunStudyRaf)
          sunStudyRaf = null
        }
        const duration = input?.durationMs ?? 8000
        const sun = useSunStore.getState()
        const startMin = sun.sunrise
        const endMin = sun.sunset
        const t0 = performance.now()
        const tick = (now: number) => {
          const u = Math.min(1, (now - t0) / duration)
          useSunStore
            .getState()
            .setMinutes(startMin + (endMin - startMin) * u)
          if (u < 1) {
            sunStudyRaf = requestAnimationFrame(tick)
          } else {
            sunStudyRaf = null
          }
        }
        sunStudyRaf = requestAnimationFrame(tick)
        return { started: true }
      },
    )

    // ---------- palette ----------
    registerClientHandler<{ initialQuery?: string }, { opened: boolean }>(
      'palette.open',
      (input) => {
        useCommandPaletteStore.getState().setOpen(true, input.initialQuery ?? '')
        return { opened: true }
      },
    )

    return () => {
      for (const id of HANDLER_IDS) unregisterClientHandler(id)
    }
  }, [])

  return null
}
