'use client'

import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

import { dispatch } from '@/lib/commands/dispatch'
import { feet, inches } from '@/lib/three/units'
import { clientToNdc } from '@/modules/editor/interactions/pointer'
import {
  grabOffsetFor,
  handlePositions,
  normalizeDegrees,
  resizeBox,
  rotateGripPosition,
  rotationFrom,
  type Box,
  type ResizeHandle,
} from '@/modules/editor/interactions/handles'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'

// Grab handles on the selection.
//
// Resizing used to mean typing into the inspector, which is right for "make it
// exactly thirty feet" and no use at all for "a bit wider than that". Both are
// real things to want, so both should work.
//
// The drag writes the store directly for live feedback and the release
// dispatches the command, which is the arrangement `DragHandler` already uses
// for moving: one audit row and one undo step for the gesture, rather than one
// per frame.

// Amber, not the selection blue.
//
// The halo, the name plate and the accent are all the same blue, so handles
// drawn in it disappeared into their own selection. A manipulator should read
// as a thing to grab rather than as more outline.
const HANDLE_COLOR = '#F59E0B'
const ROTATE_COLOR = '#7C3AED'
/** Scene units. Big enough to hit on a trackpad, small enough not to hide the pool. */
const HANDLE_SIZE = 0.9
/** Just off the ground, so handles are not buried in the deck they sit on. */
const LIFT = 0.12
/** How close a press has to be to a grip, in screen pixels, to count as grabbing it. */
const GRAB_RADIUS_PX = 16

interface Grab {
  kind: 'resize' | 'rotate'
  id: string
  start: Box
  handle?: ResizeHandle
  /** Angle between the grip and the pointer when grabbed, so rotation does not jump. */
  offset?: number
  pointerId: number
  moved: boolean
}

export function SelectionHandles() {
  const { gl, camera } = useThree()
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const shapes = useShapesStore((s) => s.shapes)
  const flags = usePresentationFlags()
  const grabRef = useRef<Grab | null>(null)
  const [dragging, setDragging] = useState(false)

  // One shape only. Handles around a multi-selection need a combined box and a
  // rule for how each member scales inside it, which is a different feature.
  // Ambiguous handles would be worse than none.
  const only = selectedIds.length === 1 ? shapes.find((s) => s.id === selectedIds[0]) : undefined
  const show = flags.showSelectionChrome && only !== undefined && !only.locked && !only.hidden

  // Screen positions of the grips, recomputed on the pointerdown that reads
  // them, so a moved camera never leaves them stale.
  const boxRef = useRef<Box | null>(null)
  const idRef = useRef<string | null>(null)
  boxRef.current = only
    ? { x: only.x, y: only.y, width: only.width, height: only.height, rotation: only.rotation }
    : null
  idRef.current = only?.id ?? null

  useEffect(() => {
    if (!show) return
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hit = new THREE.Vector3()

    /** Where the pointer is on the ground, in the inches shapes are stored in. */
    function pointerInches(e: PointerEvent): { x: number; y: number } | null {
      const screen = clientToNdc(e.clientX, e.clientY, dom.getBoundingClientRect())
      if (!screen) return null
      raycaster.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera)
      if (!raycaster.ray.intersectPlane(ground, hit)) return null
      return { x: inches(hit.x), y: inches(hit.z) }
    }

    /** Where a point on the ground lands on screen, in client pixels. */
    function toScreen(at: { x: number; y: number }): { x: number; y: number } {
      const v = new THREE.Vector3(feet(at.x), LIFT, feet(at.y)).project(camera)
      const rect = dom.getBoundingClientRect()
      return {
        x: rect.left + ((v.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - v.y) / 2) * rect.height,
      }
    }

    /**
     * Claim the press before anything else sees it.
     *
     * Capture phase on purpose. `DragHandler` calls `stopImmediatePropagation`
     * for any press that lands on a shape, and a handle sits on its own shape,
     * so a bubble-phase listener here never runs and neither does react-three's
     * own event system. Whoever is on top visually should get the press, and
     * the handles are drawn on top.
     */
    function onDown(e: PointerEvent) {
      // eslint-disable-next-line no-console
      console.info('[handles] onDown fired button', e.button)
      if (e.button !== 0) return
      const start = boxRef.current
      const id = idRef.current
      if (!start || !id) return

      const candidates: Array<{ grab: Omit<Grab, 'pointerId' | 'moved'>; at: { x: number; y: number } }> = [
        ...handlePositions(start).map(({ handle, at }) => ({
          grab: { kind: 'resize' as const, id, start, handle },
          at,
        })),
        {
          grab: {
            kind: 'rotate' as const,
            id,
            start,
            offset: grabOffsetFor(start, rotateGripPosition(start)),
          },
          at: rotateGripPosition(start),
        },
      ]

      let best: (typeof candidates)[number] | null = null
      let bestDistance = GRAB_RADIUS_PX
      for (const candidate of candidates) {
        const screen = toScreen(candidate.at)
        const d = Math.hypot(screen.x - e.clientX, screen.y - e.clientY)
        if (d <= bestDistance) {
          bestDistance = d
          best = candidate
        }
      }
      // eslint-disable-next-line no-console
      console.info('[handles] down at', Math.round(e.clientX), Math.round(e.clientY),
        'nearest', best ? Math.round(bestDistance) : 'none',
        'grips', candidates.map(c => { const s2 = toScreen(c.at); return `${Math.round(s2.x)},${Math.round(s2.y)}` }).join(' '))
      if (!best) return

      e.stopImmediatePropagation()
      e.preventDefault()
      grabRef.current = { ...best.grab, pointerId: e.pointerId, moved: false }
      setDragging(true)
      // Collapses the drag into one history entry, so undo restores the size it
      // was rather than stepping back through every frame of the gesture.
      useShapesStore.getState().beginTransaction()
      try {
        dom.setPointerCapture(e.pointerId)
      } catch {
        // A nicety. The drag still tracks while the pointer is over the canvas.
      }
    }

    function onMove(e: PointerEvent) {
      const grab = grabRef.current
      if (!grab || e.pointerId !== grab.pointerId) return
      const at = pointerInches(e)
      if (!at) return
      grab.moved = true

      if (grab.kind === 'resize' && grab.handle) {
        const shape = useShapesStore.getState().shapes.find((s) => s.id === grab.id)
        const lockedRatio = shape?.displayHint?.lockedRatio === true
        const next = resizeBox(grab.start, grab.handle, at, {
          preserveRatio: e.shiftKey || lockedRatio,
        })
        useShapesStore.getState().updateShape(grab.id, {
          x: next.x,
          y: next.y,
          width: next.width,
          height: next.height,
        })
        return
      }

      const degrees = rotationFrom(grab.start, at, grab.offset ?? 0, e.shiftKey)
      useShapesStore.getState().updateShape(grab.id, { rotation: degrees })
    }

    function onUp(e: PointerEvent) {
      const grab = grabRef.current
      if (!grab || e.pointerId !== grab.pointerId) return
      grabRef.current = null
      setDragging(false)
      useShapesStore.getState().commitTransaction()
      try {
        dom.releasePointerCapture(e.pointerId)
      } catch {
        // Capture may already be gone. Releasing twice is not an error.
      }
      if (!grab.moved) return

      const current = useShapesStore.getState().shapes.find((s) => s.id === grab.id)
      if (!current) return

      // The store already holds the result. The dispatch is what makes it
      // official: without it the change never reaches the audit log, and the
      // point of the registry is that nothing moves without a record.
      if (grab.kind === 'resize') {
        if (current.width === grab.start.width && current.height === grab.start.height) return
        void dispatch('resize.shape', { id: grab.id, width: current.width, height: current.height })
        return
      }

      if (normalizeDegrees(current.rotation) === normalizeDegrees(grab.start.rotation)) return
      void dispatch('rotate.shape', { id: grab.id, degrees: current.rotation })
    }

    // eslint-disable-next-line no-console
    console.info('[handles] listener attached')
    dom.addEventListener('pointerdown', onDown, true)
    dom.addEventListener('pointermove', onMove)
    dom.addEventListener('pointerup', onUp)
    dom.addEventListener('pointercancel', onUp)
    return () => {
      dom.removeEventListener('pointerdown', onDown, true)
      dom.removeEventListener('pointermove', onMove)
      dom.removeEventListener('pointerup', onUp)
      dom.removeEventListener('pointercancel', onUp)
    }
  }, [gl, camera, show])

  if (!show || !only) return null

  const box: Box = {
    x: only.x,
    y: only.y,
    width: only.width,
    height: only.height,
    rotation: only.rotation,
  }
  const grip = rotateGripPosition(box)


  return (
    <group renderOrder={1000}>
      {handlePositions(box).map(({ handle, at }) => (
        <mesh
          key={handle}
          position={[feet(at.x), LIFT, feet(at.y)]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[HANDLE_SIZE, HANDLE_SIZE]} />
          <meshBasicMaterial
            color={HANDLE_COLOR}
            depthTest={false}
            transparent
            opacity={dragging ? 0.6 : 1}
          />
        </mesh>
      ))}

      <mesh
        position={[feet(grip.x), LIFT, feet(grip.y)]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[HANDLE_SIZE * 0.7, 20]} />
        <meshBasicMaterial color={ROTATE_COLOR} depthTest={false} transparent />
      </mesh>
    </group>
  )
}
