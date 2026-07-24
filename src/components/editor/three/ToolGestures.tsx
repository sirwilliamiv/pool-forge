'use client'

import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { dispatch } from '@/lib/commands/dispatch'
import { inches } from '@/lib/three/units'
import { pickShapeId } from '@/lib/three/pick'
import { useEditorStore, type Vec3 } from '@/modules/editor/state/editorStore'
import { MeasureLabelOverlay } from '../shell/MeasureLabelOverlay'
import { AnnotationDialog } from '../shell/AnnotationDialog'

const GROUND_Y = 0

const ADD_TOOL_STENCIL: Record<string, string> = {
  'tool.pool-shape': 'pool.rectangle',
  'tool.steps': 'pool.corner-steps',
  'tool.water-feature': 'water.waterfall',
  'tool.lights': 'feature.light',
  'tool.deck': 'deck.concrete',
}

function intersectGround(
  e: PointerEvent,
  el: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
): THREE.Vector3 | null {
  const rect = el.getBoundingClientRect()
  const ndc = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(ndc, camera)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND_Y)
  const hit = new THREE.Vector3()
  if (!raycaster.ray.intersectPlane(plane, hit)) return null
  return hit
}

export function ToolGestures() {
  const { gl, camera, scene } = useThree()
  const downRef = useRef<{ x: number; y: number } | null>(null)
  const pointerWorldRef = useRef<Vec3 | null>(null)
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
    }

    function onPointerMove(e: PointerEvent) {
      // Track for measure preview line; cheap raycast on every move
      const tool = useEditorStore.getState().activeTool
      if (tool !== 'tool.measure') return
      const hit = intersectGround(e, el, camera, raycaster)
      if (hit) pointerWorldRef.current = [hit.x, hit.y, hit.z]
    }

    function onPointerUp(e: PointerEvent) {
      const down = downRef.current
      downRef.current = null
      if (!down) return
      const dx = Math.abs(e.clientX - down.x)
      const dy = Math.abs(e.clientY - down.y)
      if (dx > 4 || dy > 4) return // drag, not a click — defer to orbit/selection

      const tool = useEditorStore.getState().activeTool

      // Add-* tools: place a stencil at click point, then return to select.
      // For 'tool.pool-shape', the active stencil id comes from PoolShapePicker.
      let stencilId: string | undefined
      if (tool === 'tool.pool-shape') {
        stencilId = useEditorStore.getState().activeStencilId ?? 'pool.rectangle'
      } else {
        stencilId = ADD_TOOL_STENCIL[tool]
      }
      if (stencilId) {
        const hit = intersectGround(e, el, camera, raycaster)
        if (!hit) return
        // Click is the *center* of the new shape; the store stores top-left
        // in inches and renderers offset by w/2,h/2. Small offset is fine —
        // user can drag to refine.
        void dispatch('add.shape', {
          stencilId,
          x: inches(hit.x),
          y: inches(hit.z),
        })
        useEditorStore.getState().setActiveTool('tool.select')
        return
      }

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
        const a = useEditorStore.getState().measureA
        const b = useEditorStore.getState().measureB
        if (!a) {
          useEditorStore.getState().setMeasureA(p)
          useEditorStore.getState().setMeasureB(null)
        } else if (!b) {
          useEditorStore.getState().setMeasureB(p)
        } else {
          // Restart on third click
          useEditorStore.getState().setMeasureA(p)
          useEditorStore.getState().setMeasureB(null)
        }
        return
      }

      if (tool === 'tool.annotation') {
        const hit = intersectGround(e, el, camera, raycaster)
        if (!hit) return
        setPendingAnnotation({ worldX: hit.x, worldZ: hit.z })
        return
      }

      if (tool === 'tool.comment') {
        // No comment infra in v1 — log and consume.
        // eslint-disable-next-line no-console
        console.info('[Pool Forge] Comment tool: comments deferred for v1.')
        return
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        const tool = useEditorStore.getState().activeTool
        if (tool === 'tool.measure') {
          useEditorStore.getState().clearMeasure()
        }
      }
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
      {pendingAnnotation && (
        <AnnotationDialog
          onSave={(text) => {
            void dispatch('add.shape', {
              stencilId: 'feature.deep-end-marker',
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
