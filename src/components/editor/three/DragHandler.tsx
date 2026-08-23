'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { dispatch } from '@/lib/commands/dispatch'
import { pickShapeId } from '@/lib/three/pick'
import { clientToNdc } from '@/modules/editor/interactions/pointer'
import {
  canDragShape,
  dragTranslation,
  isNoOpMove,
  passesDragThreshold,
} from '@/modules/editor/interactions/drag'
import { useEditorStore } from '@/modules/editor/state/editorStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

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
      const screen = clientToNdc(clientX, clientY, dom.getBoundingClientRect())
      if (!screen) return null
      ndc.set(screen.x, screen.y)
      raycaster.setFromCamera(ndc, camera)
      const ok = raycaster.ray.intersectPlane(groundPlane, hitPoint)
      if (!ok) return null
      return hitPoint.clone()
    }

    function onPointerDown(e: PointerEvent) {
      // Only left button.
      if (e.button !== 0) return

      const id = pickShapeId(raycaster, camera, scene, dom, e.clientX, e.clientY)
      if (!id) return

      const shape = useShapesStore.getState().shapes.find((s) => s.id === id)
      if (!shape) return
      // Right tool, already selected, not locked, not hidden.
      if (
        !canDragShape({
          activeTool: useEditorStore.getState().activeTool,
          shape,
          selectedIds: useSelectionStore.getState().selectedIds,
        })
      ) {
        return
      }

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
          !passesDragThreshold(
            { x: drag.startClientX, y: drag.startClientY },
            { x: e.clientX, y: e.clientY },
          )
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

      const { x: newX, y: newY } = dragTranslation({
        startGroundX: drag.startGroundX,
        startGroundZ: drag.startGroundZ,
        groundX: ground.x,
        groundZ: ground.z,
        startShapeX: drag.startShapeX,
        startShapeY: drag.startShapeY,
        snap: useEditorStore.getState().snapEnabled,
      })

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

      // A drag that ends where it started is not a move. Committing it would
      // write a history entry and an audit row for nothing, so the user's next
      // undo would appear to do nothing at all.
      if (
        isNoOpMove(
          { x: finished.startShapeX, y: finished.startShapeY },
          { x: finished.lastX, y: finished.lastY },
        )
      ) {
        return
      }

      // SelectionPicker's own pointerup uses the same 4px slop, so a real drag
      // never registers there as a click.
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
