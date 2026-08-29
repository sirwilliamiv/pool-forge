'use client'

import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { dispatch } from '@/lib/commands/dispatch'
import { inches } from '@/lib/three/units'
import { pickShapeId } from '@/lib/three/pick'
import { useCommentsStore } from '@/modules/editor/state/commentsStore'
import { useEditorStore, type Vec3 } from '@/modules/editor/state/editorStore'
import {
  ANNOTATION_STENCIL,
  nextMeasurePoints,
  placementFrom,
  stencilForTool,
  type GroundPoint,
} from '@/modules/editor/interactions/gestures'
import { getStencil } from '@/modules/editor/stencils'
import { clientToNdc, isClick } from '@/modules/editor/interactions/pointer'
import { normalizeToolId } from '@/modules/editor/interactions/toolIds'
import { MeasureLabelOverlay } from '../shell/MeasureLabelOverlay'
import { AnnotationDialog } from '../shell/AnnotationDialog'

const GROUND_Y = 0

function intersectGround(
  e: PointerEvent,
  el: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
): THREE.Vector3 | null {
  const screen = clientToNdc(e.clientX, e.clientY, el.getBoundingClientRect())
  if (!screen) return null
  raycaster.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y)
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(plane, hit)) return null
  return hit
}

export function ToolGestures() {
  const { gl, camera, scene } = useThree()
  const downRef = useRef<{ x: number; y: number } | null>(null)
  // Where the press landed on the ground, so a drag can size the new shape.
  const downGroundRef = useRef<GroundPoint | null>(null)
  const pointerWorldRef = useRef<Vec3 | null>(null)
  const [dragBox, setDragBox] = useState<{
    cx: number
    cz: number
    w: number
    h: number
  } | null>(null)
  const [pendingAnnotation, setPendingAnnotation] = useState<{
    worldX: number
    worldZ: number
  } | null>(null)

  // For the pending-A → B preview line, track pointer world position.
  const measureA = useEditorStore((s) => s.measureA)
  const measureB = useEditorStore((s) => s.measureB)

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      downRef.current = { x: e.clientX, y: e.clientY }

      // Only for the tools that place something. Everything else leaves the
      // press to the camera, which is what a drag on empty ground should do.
      const tool = normalizeToolId(useEditorStore.getState().activeTool)
      const placing = stencilForTool(tool, useEditorStore.getState().activeStencilId)
      if (!placing) return
      const hit = intersectGround(e, el, camera, raycaster)
      downGroundRef.current = hit ? { x: hit.x, z: hit.z } : null
    }

    function onPointerMove(e: PointerEvent) {
      const tool = normalizeToolId(useEditorStore.getState().activeTool)

      // Show the rectangle while it is being dragged. Without it the gesture
      // gives no sign it is working until the mouse comes up, which is most of
      // why it read as broken.
      const start = downGroundRef.current
      if (start) {
        const hit = intersectGround(e, el, camera, raycaster)
        if (hit) {
          const w = Math.abs(hit.x - start.x)
          const h = Math.abs(hit.z - start.z)
          setDragBox(
            w > 0.25 && h > 0.25
              ? { cx: (start.x + hit.x) / 2, cz: (start.z + hit.z) / 2, w, h }
              : null,
          )
        }
        return
      }

      // Track for measure preview line; cheap raycast on every move
      if (tool !== 'tool.measure') return
      const hit = intersectGround(e, el, camera, raycaster)
      if (hit) pointerWorldRef.current = [hit.x, hit.y, hit.z]
    }

    function onPointerUp(e: PointerEvent) {
      // Releasing a non-primary button ends an orbit or a pan, never a
      // placement: a right-click while the deck tool was armed used to drop a
      // deck.
      if (e.button !== 0) return
      const down = downRef.current
      downRef.current = null
      const downGround = downGroundRef.current
      downGroundRef.current = null
      setDragBox(null)

      const tool = normalizeToolId(useEditorStore.getState().activeTool)

      // Add-* tools: place a stencil, then return to select.
      // For 'tool.pool-shape', the active stencil id comes from PoolShapePicker.
      const stencilId = stencilForTool(
        tool,
        useEditorStore.getState().activeStencilId,
      )
      if (stencilId) {
        const hit = intersectGround(e, el, camera, raycaster)
        if (!hit) return

        // Click places the stencil at its catalogue size, centred on the point
        // clicked. Drag places it in the rectangle dragged out. Both go through
        // one function so the two gestures cannot drift apart.
        const stencil = getStencil(stencilId)
        const factor = stencil?.defaultDimensions.unit === 'ft' ? 12 : 1
        const placement = placementFrom(downGround, { x: hit.x, z: hit.z }, {
          widthIn: (stencil?.defaultDimensions.width ?? 96) * factor,
          heightIn: (stencil?.defaultDimensions.height ?? 96) * factor,
        })

        void dispatch('add.shape', {
          stencilId,
          x: placement.x,
          y: placement.y,
          width: placement.width,
          height: placement.height,
        })
        useEditorStore.getState().setActiveTool('tool.select')
        return
      }

      // Everything below is a click, not a drag: a release far from the press
      // was the camera moving, and must not drop a measurement or a note.
      if (!isClick(down, { x: e.clientX, y: e.clientY })) return

      if (tool === 'tool.material-brush') {
        const id = pickShapeId(raycaster, camera, scene, el, e.clientX, e.clientY)
        if (!id) return
        const matId = useEditorStore.getState().activeMaterialId
        if (!matId) {
          // No active material — consume the click but tell user via toast?
          // For v1 just no-op silently; Materials tab is a follow-up.
          return
        }
        void dispatch('pool.material.set', {
          id,
          slot: 'interior' as const,
          materialId: matId,
        })
        return
      }

      if (tool === 'tool.measure') {
        const hit = intersectGround(e, el, camera, raycaster)
        if (!hit) return
        const p: Vec3 = [hit.x, hit.y, hit.z]
        const store = useEditorStore.getState()
        const next = nextMeasurePoints({ a: store.measureA, b: store.measureB }, p)
        store.setMeasureA(next.a)
        store.setMeasureB(next.b)
        // Two points is a measurement, so the tool is done. Left armed, the
        // third click silently threw the measurement away and started another,
        // and the only way out was to go and find the Move button. The reading
        // stays on screen; it is the tool that stops.
        if (next.a && next.b) store.setActiveTool('tool.select')
        return
      }

      if (tool === 'tool.annotation') {
        const hit = intersectGround(e, el, camera, raycaster)
        if (!hit) return
        setPendingAnnotation({ worldX: hit.x, worldZ: hit.z })
        return
      }

      if (tool === 'tool.comment') {
        const hit = intersectGround(e, el, camera, raycaster)
        if (!hit) return
        // Opens the composer at this point; nothing is created until there is
        // something to create. CommentPins renders it and dispatches the
        // command.
        useCommentsStore.getState().beginDraft({ x: inches(hit.x), y: inches(hit.z) })
        return
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const store = useEditorStore.getState()
      const tool = normalizeToolId(store.activeTool)
      if (tool === 'tool.measure') store.clearMeasure()
      // Escape puts the pointer down, whatever was in hand. A tool that keeps
      // hold of the canvas after Escape has no obvious way out at all.
      if (tool !== 'tool.select' && tool !== 'tool.pan') store.setActiveTool('tool.select')
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [gl, camera, scene])

  // Render measure markers + line + label inside the R3F scene.
  return (
    <>
      {measureA && (
        <mesh position={measureA}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshBasicMaterial color="#0E9DE5" />
        </mesh>
      )}
      {measureB && (
        <mesh position={measureB}>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshBasicMaterial color="#0E9DE5" />
        </mesh>
      )}
      {measureA && measureB && (
        <>
          <Line
            points={[measureA, measureB]}
            color="#0E9DE5"
            lineWidth={2}
            depthTest={false}
          />
          <MeasureLabelOverlay a={measureA} b={measureB} />
        </>
      )}
      {dragBox && (
        <>
          <mesh position={[dragBox.cx, 0.04, dragBox.cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[dragBox.w, dragBox.h]} />
            <meshBasicMaterial color="#0E9DE5" transparent opacity={0.18} depthTest={false} />
          </mesh>
          <Line
            points={[
              [dragBox.cx - dragBox.w / 2, 0.05, dragBox.cz - dragBox.h / 2],
              [dragBox.cx + dragBox.w / 2, 0.05, dragBox.cz - dragBox.h / 2],
              [dragBox.cx + dragBox.w / 2, 0.05, dragBox.cz + dragBox.h / 2],
              [dragBox.cx - dragBox.w / 2, 0.05, dragBox.cz + dragBox.h / 2],
              [dragBox.cx - dragBox.w / 2, 0.05, dragBox.cz - dragBox.h / 2],
            ]}
            color="#0E9DE5"
            lineWidth={2}
            depthTest={false}
          />
        </>
      )}
      {pendingAnnotation && (
        <AnnotationDialog
          onSave={(text) => {
            void dispatch('add.shape', {
              stencilId: ANNOTATION_STENCIL,
              x: inches(pendingAnnotation.worldX),
              y: inches(pendingAnnotation.worldZ),
              displayHint: { text },
            })
            setPendingAnnotation(null)
          }}
          onCancel={() => setPendingAnnotation(null)}
        />
      )}
    </>
  )
}
