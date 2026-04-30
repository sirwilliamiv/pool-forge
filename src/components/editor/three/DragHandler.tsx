'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { dispatch } from '@/lib/commands/dispatch'
import { inches } from '@/lib/three/units'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

const DRAG_THRESHOLD_PX = 4

export function DragHandler() {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hitPoint = new THREE.Vector3()

    type DragState = {
      id: string
      pointerId: number
      startClientX: number
      startClientY: number
      startGroundX: number
      startGroundZ: number
      startShapeX: number
      startShapeY: number
      moved: boolean
      lastX: number
      lastY: number
    }

    let drag: DragState | null = null

    function projectToGround(clientX: number, clientY: number): THREE.Vector3 | null {
      const rect = dom.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const ok = raycaster.ray.intersectPlane(groundPlane, hitPoint)
      if (!ok) return null
      return hitPoint.clone()
    }

    function pickShapeId(clientX: number, clientY: number): string | null {
      const rect = dom.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const intersects = raycaster.intersectObjects(scene.children, true)
      for (const hit of intersects) {
        let obj: THREE.Object3D | null = hit.object
        while (obj && !(obj.userData && obj.userData.id) && obj.parent) {
          obj = obj.parent
        }
        if (obj && obj.userData && obj.userData.id) {
          return obj.userData.id as string
        }
      }
      return null
    }

    function onPointerDown(e: PointerEvent) {
      // Only left button.
      if (e.button !== 0) return

      // Only when select tool is active.
      const tool = useEditorStore.getState().activeTool
      if (tool !== 'tool.select' && tool !== 'select') return

      const id = pickShapeId(e.clientX, e.clientY)
      if (!id) return

      const selected = useSelectionStore.getState().selectedIds
      if (!selected.includes(id)) return

      const shape = useShapesStore.getState().shapes.find((s) => s.id === id)
      if (!shape) return
      if (shape.locked) return

      const ground = projectToGround(e.clientX, e.clientY)
      if (!ground) return

      drag = {
        id,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startGroundX: ground.x,
        startGroundZ: ground.z,
        startShapeX: shape.x,
        startShapeY: shape.y,
        moved: false,
        lastX: shape.x,
        lastY: shape.y,
      }
      // Stop CustomOrbit (and any later listener on the same element) from
      // also treating this pointerdown as a camera-rotate.
      e.stopImmediatePropagation()
    }

    function onPointerMove(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return

      // Threshold: don't start moving until we exceed 4px.
      if (!drag.moved) {
        if (
          Math.abs(e.clientX - drag.startClientX) <= DRAG_THRESHOLD_PX &&
          Math.abs(e.clientY - drag.startClientY) <= DRAG_THRESHOLD_PX
        ) {
          return
        }
        drag.moved = true
        try {
          dom.setPointerCapture(drag.pointerId)
        } catch {
          // ignore
        }
      }

      const ground = projectToGround(e.clientX, e.clientY)
      if (!ground) return

      const dxFeet = ground.x - drag.startGroundX
      const dzFeet = ground.z - drag.startGroundZ
      const newX = drag.startShapeX + inches(dxFeet)
      const newY = drag.startShapeY + inches(dzFeet)

      drag.lastX = newX
      drag.lastY = newY

      // Direct mutation, no dispatch — coalesced commit on pointerup.
      useShapesStore.getState().updateShape(drag.id, { x: newX, y: newY })
    }

    function onPointerUp(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return
      const finished = drag
      drag = null

      try {
        dom.releasePointerCapture(finished.pointerId)
      } catch {
        // ignore
      }

      if (!finished.moved) return

      // Stop the click from also reaching SelectionPicker as a "click" — its
      // pointerup uses a 4px threshold, so a real drag won't register as a
      // click anyway.
      void dispatch('move.shape', {
        id: finished.id,
        x: finished.lastX,
        y: finished.lastY,
      })
    }

    function onPointerCancel(e: PointerEvent) {
      if (!drag || e.pointerId !== drag.pointerId) return
      drag = null
    }

    // Capture phase so we can stopImmediatePropagation() before CustomOrbit's
    // bubble-phase listener runs.
    dom.addEventListener('pointerdown', onPointerDown, { capture: true })
    dom.addEventListener('pointermove', onPointerMove)
    dom.addEventListener('pointerup', onPointerUp)
    dom.addEventListener('pointercancel', onPointerCancel)
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown, { capture: true })
      dom.removeEventListener('pointermove', onPointerMove)
      dom.removeEventListener('pointerup', onPointerUp)
      dom.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [gl, camera, scene])

  return null
}
