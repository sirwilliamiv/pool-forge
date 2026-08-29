'use client'

import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { dispatch } from '@/lib/commands/dispatch'
import {
  isClosed,
  orthoConstrain,
  sampleArc,
  snapPoint,
  tidyFreehand,
  type Point,
} from '@/lib/geometry/drawing'
import { groundPoint } from '@/lib/three/ground'
import { feet, inches } from '@/lib/three/units'
import { normalizeToolId } from '@/modules/editor/interactions/toolIds'
import { activeSnapInches, useDrawStore } from '@/modules/editor/state/drawStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useViewStore } from '@/modules/editor/state/viewStore'

/** Inches. How far apart the ends can be and still mean a closed outline. */
const CLOSE_TOLERANCE = 18

/** Inches. Freehand detail below this was hand-shake, not intent. */
const SIMPLIFY_TOLERANCE = 4

const DRAW_TOOLS = new Set(['tool.line', 'tool.curve', 'tool.freehand'])

/**
 * Drawing lines, curves and freehand outlines in plan.
 *
 * Its own component rather than another branch in `ToolGestures`, because these
 * three tools are modal in a way the placement tools are not: they hold state
 * between clicks, they preview, and they end on a key rather than on a release.
 * Folding that into the handler that also places stencils would have made both
 * harder to follow and easier to break.
 *
 * The rule throughout is that nothing reaches the drawing until the path is
 * finished. A half-drawn line lives in `drawStore`, which persistence does not
 * watch, so abandoning one leaves nothing behind and a save mid-draw cannot
 * capture a decision the user has not made yet.
 */
export function SketchGestures() {
  const { gl, camera } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const activeTool = useEditorStore(s => s.activeTool)
  const draft = useDrawStore(s => s.draft)
  const cursor = useDrawStore(s => s.cursor)
  const [arcAnchor, setArcAnchor] = useState<Point[] | null>(null)

  const tool = normalizeToolId(activeTool)
  const drawing = DRAW_TOOLS.has(tool)

  useEffect(() => {
    if (!drawing) {
      useDrawStore.getState().clearDraft()
      setArcAnchor(null)
      return
    }
    // Everybody draws a plan from above, so arming a drawing tool goes to plan
    // rather than leaving somebody drawing across a perspective view and
    // wondering why the rectangle is a trapezium.
    //
    // Section is the case that would actually be wrong rather than merely odd:
    // that camera looks along the ground, so the plane every click is measured
    // against is edge-on, and a click either misses it entirely or lands
    // hundreds of feet away depending on a pixel. Switching out of it is the
    // only sane answer.
    const view = useViewStore.getState()
    if (view.viewMode !== 'plan') view.setViewMode('plan')
  }, [drawing, tool])

  useEffect(() => {
    if (!drawing) return
    const element = gl.domElement

    /** Pointer position on the ground, in inches, snapped and constrained. */
    function pointAt(event: PointerEvent, constrain: boolean): Point | null {
      const hit = groundPoint(event, element, camera, raycaster.current)
      if (!hit) return null
      const raw: Point = { x: inches(hit.x), y: inches(hit.z) }
      const state = useDrawStore.getState()
      // Alt suspends snapping for one move, the way every drawing tool lets you
      // step off the grid without changing the grid.
      const spacing = event.altKey ? 0 : activeSnapInches(state)
      const last = state.draft[state.draft.length - 1]
      const constrained = constrain && event.shiftKey && last ? orthoConstrain(last, raw) : raw
      return spacing > 0 ? snapPoint(constrained, spacing) : constrained
    }

    function commit(points: Point[], closed: boolean): void {
      if (points.length < 2) return
      void dispatch('sketch.create', { points, closed })
      useDrawStore.getState().clearDraft()
      setArcAnchor(null)
    }

    function finish(): void {
      const state = useDrawStore.getState()
      const points = state.draft
      if (points.length < 2) {
        state.clearDraft()
        return
      }
      commit(points, isClosed(points, CLOSE_TOLERANCE))
    }

    let freehandSamples: Point[] = []

    function onPointerDown(event: PointerEvent): void {
      if (event.button !== 0) return
      const point = pointAt(event, true)
      if (!point) return
      event.stopPropagation()

      if (tool === 'tool.freehand') {
        freehandSamples = [point]
        useDrawStore.getState().beginDraft(point)
        useDrawStore.getState().setFreehand(true)
        return
      }

      if (tool === 'tool.curve') {
        // Three clicks: start, a point the arc passes through, and the end.
        const anchors = arcAnchor ?? []
        const next = [...anchors, point]
        if (next.length < 3) {
          setArcAnchor(next)
          const store = useDrawStore.getState()
          if (store.draft.length === 0) store.beginDraft(point)
          return
        }
        const [from, through, to] = next as [Point, Point, Point]
        const arc = sampleArc(from, through, to)
        const store = useDrawStore.getState()
        // Drop the seam: the arc starts where the draft already ended.
        const existing = store.draft.length > 0 ? store.draft.slice(0, -1) : []
        useDrawStore.setState({ draft: [...existing, ...arc] })
        setArcAnchor([to])
        return
      }

      // Line: each click commits a vertex.
      const store = useDrawStore.getState()
      if (store.draft.length === 0) store.beginDraft(point)
      else store.addDraftPoint(point)
    }

    function onPointerMove(event: PointerEvent): void {
      const point = pointAt(event, true)
      if (!point) return
      const store = useDrawStore.getState()
      store.setCursor(point)
      if (store.freehand) {
        freehandSamples.push(point)
        // Shown raw while dragging; tidied only once, on release. Tidying every
        // move would make the line under the cursor jump as points were dropped
        // and re-added, which reads as the tool fighting you.
        useDrawStore.setState({ draft: [...freehandSamples] })
      }
    }

    function onPointerUp(event: PointerEvent): void {
      const store = useDrawStore.getState()
      if (!store.freehand) return
      store.setFreehand(false)
      const spacing = event.altKey ? 0 : activeSnapInches(store)
      const tidy = tidyFreehand(freehandSamples, {
        tolerance: SIMPLIFY_TOLERANCE,
        spacing,
      })
      freehandSamples = []
      commit(tidy, isClosed(tidy, CLOSE_TOLERANCE))
    }

    function onDoubleClick(event: MouseEvent): void {
      event.preventDefault()
      finish()
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        useDrawStore.getState().clearDraft()
        setArcAnchor(null)
        return
      }
      if (event.key === 'Enter') {
        finish()
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        // Mid-draw, backspace takes back the last vertex rather than deleting a
        // shape. Nothing is selected while drawing, so there is nothing else it
        // could sensibly mean.
        event.preventDefault()
        useDrawStore.getState().popDraftPoint()
      }
    }

    // Capture, because the camera and the selection picker also listen and the
    // first of them to see a press would otherwise start an orbit under a tool
    // that is trying to draw.
    element.addEventListener('pointerdown', onPointerDown, { capture: true })
    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerup', onPointerUp)
    element.addEventListener('dblclick', onDoubleClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      element.removeEventListener('pointerdown', onPointerDown, { capture: true })
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('dblclick', onDoubleClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [drawing, tool, gl, camera, arcAnchor])

  if (!drawing || draft.length === 0) return null

  const preview: Point[] = cursor && !useDrawStore.getState().freehand ? [...draft, cursor] : draft
  const points = preview.map(p => new THREE.Vector3(feet(p.x), 0.05, feet(p.y)))
  if (points.length < 2) return null

  return (
    <>
      <Line points={points} color="#0F172A" lineWidth={2} dashed={false} />
      {/* A dot per committed vertex, so it is obvious what a click did and how
          many corners the path actually has after snapping. */}
      {draft.map((p, i) => (
        <mesh key={i} position={[feet(p.x), 0.06, feet(p.y)]}>
          <sphereGeometry args={[0.12, 10, 10]} />
          <meshBasicMaterial color="#F59E0B" />
        </mesh>
      ))}
    </>
  )
}
