'use client'

import { useEffect } from 'react'
import { registerClientHandler, unregisterClientHandler } from '@/lib/commands/dispatch'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { useSunStore } from '@/modules/editor/state/sunStore'
import { useViewStore } from '@/modules/editor/state/viewStore'
import { ShapeKind } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { feet } from '@/lib/three/units'
import { useCommandPaletteStore } from './shell/CommandPalette'

let sunStudyRaf: number | null = null

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
  // canvas category
  'selection.set',
  'camera.set.view',
  'camera.frame.selection',
  'mode.set.presentation',
  'view.set.tab',
  'tool.activate',
  // scene category
  'sun.set.time',
  'sun.run.study',
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
      useShapesStore.getState().updateShape(input.id, { x, y })
      return { id: input.id, x, y }
    })

    registerClientHandler<
      { id: string; width: number; height: number },
      { id: string; width: number; height: number }
    >('resize.shape', (input) => {
      useShapesStore
        .getState()
        .updateShape(input.id, { width: input.width, height: input.height })
      return { id: input.id, width: input.width, height: input.height }
    })

    registerClientHandler<
      { id: string; degrees: number; relative?: boolean },
      { id: string; degrees: number }
    >('rotate.shape', (input) => {
      const cur = useShapesStore.getState().shapes.find((s) => s.id === input.id)
      const rotation = input.relative ? (cur?.rotation ?? 0) + input.degrees : input.degrees
      useShapesStore.getState().updateShape(input.id, { rotation })
      return { id: input.id, degrees: rotation }
    })

    registerClientHandler<{ ids: string[] }, { deletedIds: string[] }>(
      'delete.shape',
      (input) => {
        useShapesStore.getState().removeShapes(input.ids)
        useSelectionStore.getState().clear()
        return { deletedIds: input.ids }
      },
    )

    registerClientHandler<
      { id: string; offsetX?: number; offsetY?: number },
      { sourceId: string; newId: string }
    >('duplicate.shape', (input) => {
      const newId = useShapesStore.getState().duplicate(input.id)
      return { sourceId: input.id, newId: newId ?? '' }
    })

    registerClientHandler<{ id: string; name: string }, { id: string; name: string }>(
      'shape.rename',
      (input) => {
        useShapesStore.getState().renameShape(input.id, input.name)
        return { id: input.id, name: input.name }
      },
    )

    registerClientHandler<{ id: string; hidden: boolean }, { id: string; hidden: boolean }>(
      'shape.hide',
      (input) => {
        useShapesStore.getState().updateShape(input.id, { hidden: input.hidden })
        return { id: input.id, hidden: input.hidden }
      },
    )

    registerClientHandler<{ id: string; locked: boolean }, { id: string; locked: boolean }>(
      'shape.lock',
      (input) => {
        useShapesStore.getState().updateShape(input.id, { locked: input.locked })
        return { id: input.id, locked: input.locked }
      },
    )

    registerClientHandler<
      { id: string; materialId: string },
      { id: string; materialId: string }
    >('set.shape.material', (input) => {
      // Shape doesn't carry materialId yet; persist via name patch path until
      // the schema gains explicit material slots.
      return { id: input.id, materialId: input.materialId }
    })

    registerClientHandler<
      {
        id: string
        length?: number
        width?: number
        avgDepth?: number
        shallowDepth?: number
        deepDepth?: number
        slope?: number
      },
      { id: string }
    >('pool.geometry.update', (input) => {
      const patch: Partial<{
        width: number
        height: number
        depthShallow: number
        depthDeep: number
      }> = {}
      if (input.length != null) patch.width = input.length * 12
      if (input.width != null) patch.height = input.width * 12
      if (input.shallowDepth != null) patch.depthShallow = input.shallowDepth
      if (input.deepDepth != null) patch.depthDeep = input.deepDepth
      if (Object.keys(patch).length > 0) {
        useShapesStore.getState().updateShape(input.id, patch)
      }
      return { id: input.id }
    })

    registerClientHandler<
      { id: string; slot: 'interior' | 'coping' | 'tileBand'; materialId: string },
      { id: string; slot: 'interior' | 'coping' | 'tileBand'; materialId: string }
    >('pool.material.set', (input) => {
      // No persistence yet — DrawingObject.displayHint is the future home.
      // For v1, the audit log captures the intent.
      return { id: input.id, slot: input.slot, materialId: input.materialId }
    })

    registerClientHandler<
      { id: string; axis?: 'x' | 'y' },
      { id: string; flippedX: boolean; flippedY: boolean }
    >('pool.flip', (input) => {
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
      const patch: Partial<{ depthShallow: number; depthDeep: number }> = {}
      if (input.shallowDepth != null) patch.depthShallow = input.shallowDepth
      if (input.deepDepth != null) patch.depthDeep = input.deepDepth
      if (Object.keys(patch).length > 0) {
        useShapesStore.getState().updateShape(input.id, patch)
      }
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
        const shapes = useShapesStore.getState().shapes
        const selected = shapes.filter((s) => ids.includes(s.id))
        if (selected.length === 0) {
          useCameraStore.getState().setView('iso')
          return { framed: true }
        }
        // Combined bbox in inches → feet (1 unit = 1 foot in scene).
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const s of selected) {
          if (s.x < minX) minX = s.x
          if (s.y < minY) minY = s.y
          if (s.x + s.width > maxX) maxX = s.x + s.width
          if (s.y + s.height > maxY) maxY = s.y + s.height
        }
        const cx = feet((minX + maxX) / 2)
        const cz = feet((minY + maxY) / 2)
        const sizeX = feet(maxX - minX)
        const sizeZ = feet(maxY - minY)
        const radius = Math.max(8, Math.hypot(sizeX, sizeZ) * 0.7)
        const distance = Math.max(15, radius * 2.6)
        // Orbit pose: 35° elevation looking SE, target at bbox center on ground.
        const elev = 0.5 // ~28°
        const az = -0.756 // match ISO_DEFAULT azimuth
        const px = cx + distance * Math.cos(elev) * Math.cos(az)
        const py = distance * Math.sin(elev)
        const pz = cz + distance * Math.cos(elev) * Math.sin(az)
        useCameraStore.getState().frameSelection([px, py, pz], [cx, 0, cz])
        return { framed: true }
      },
    )

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
