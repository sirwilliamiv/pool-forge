'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { framingFor } from '@/modules/editor/framing'
import { visibleBounds } from '@/modules/editor/placement'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import type { Shape } from '@/modules/editor/state/shapes'
import { addedIds, boxCorners, fullyVisible } from '@/modules/editor/visibility'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Keep what matters in frame.
 *
 * Two moments, one rule. **On open**, a saved drawing has to be on screen:
 * `CameraRig` starts the perspective camera at a fixed pose that knows nothing
 * about where the pool was drawn, so a project whose drawing sits away from the
 * origin opened onto empty grid with three layers listed in the panel and a
 * quote in the corner. Everything was loaded and none of it was visible, and the
 * way out was a FIT button nobody new would think to press.
 *
 * **On add**, an object placed from the stencil panel, the palette or by voice
 * is staged beside the drawing rather than under a pointer, which is right in
 * world coordinates and invisible once the camera has moved or the drawing has
 * grown.
 *
 * Both are the same question, asked of the camera rather than of the caller:
 * can this be seen, and if not, look at it. Something placed by pointer is
 * already on screen, so it never moves the view, and no call site has to
 * remember to ask.
 */
export function RevealNewShapes() {
  const camera = useThree(state => state.camera)
  /** Ids already accounted for, so only genuinely new objects are considered. */
  const knownRef = useRef<Set<string> | null>(null)
  const fittedRef = useRef(false)
  const fitRef = useRef<(() => boolean) | null>(null)
  const checkRef = useRef<((shapes: Shape[]) => void) | null>(null)

  useEffect(() => {
    /** True when every corner of the footprint is comfortably inside the frame. */
    function isVisible(box: Box): boolean {
      const corners = boxCorners({
        x: feet(box.x),
        y: feet(box.y),
        width: feet(box.width),
        height: feet(box.height),
      }).map(([x, y, z]) => {
        const point = new THREE.Vector3(x, y, z).project(camera)
        return { x: point.x, y: point.y, z: point.z }
      })
      return fullyVisible(corners)
    }

    function lookAt(box: Box): void {
      // Plan and section are orthographic, and CustomOrbit's transitions are
      // perspective-orbit only: `frameSelection` is ignored there, so in 2D this
      // would report success and leave the view where it was. Those cameras are
      // moved by writing their position, which is what panning already does.
      if (camera instanceof THREE.OrthographicCamera) {
        const lookDir = new THREE.Vector3()
        camera.getWorldDirection(lookDir)
        const right = new THREE.Vector3().crossVectors(lookDir, camera.up).normalize()
        const up = new THREE.Vector3().crossVectors(right, lookDir).normalize()
        const centre = new THREE.Vector3(
          feet(box.x + box.width / 2),
          0,
          feet(box.y + box.height / 2),
        )
        // Slide along the two screen axes only. Moving along the view direction
        // would push the drawing through the near plane in plan view.
        const offset = centre.clone().sub(camera.position)
        camera.position.addScaledVector(right, offset.dot(right))
        camera.position.addScaledVector(up, offset.dot(up))
        camera.updateMatrixWorld()
        return
      }

      const { pose, target } = framingFor(box)
      useCameraStore.getState().frameSelection(pose, target)
    }

    function check(shapes: Shape[]): void {
      // Nothing to compare against yet means the drawing has not been seen, and
      // the opening fit is `useFrame`'s job rather than this one's.
      if (knownRef.current === null) return

      const added = addedIds(knownRef.current, shapes)
      knownRef.current = new Set(shapes.map(shape => shape.id))
      if (added.length === 0) return

      // The newest, when several arrive at once, rather than arguing about which.
      const newest = added[added.length - 1]
      const shape = shapes.find(item => item.id === newest)
      if (!shape || shape.hidden) return
      if (isVisible(shape)) return
      lookAt(shape)
    }

    checkRef.current = check
    fitRef.current = () => {
      const shapes = useShapesStore.getState().shapes
      if (shapes.length === 0) return false
      knownRef.current = new Set(shapes.map(shape => shape.id))
      const drawing = visibleBounds(shapes)
      // Only when it is not already in view, so a project that happens to sit
      // under the default pose is left exactly where it is.
      if (drawing && drawing.width > 0 && drawing.height > 0 && !isVisible(drawing)) {
        lookAt(drawing)
      }
      return true
    }

    return useShapesStore.subscribe(state => {
      checkRef.current?.(state.shapes)
    })
  }, [camera])

  // The opening fit waits for a rendered frame, and for the drawing to arrive.
  //
  // Both matter. `EditorPersistence` hydrates the store in an effect, so at
  // mount there is usually nothing to frame; and a camera that has not rendered
  // yet still carries an identity projection, against which every point
  // projects to dead centre and nothing is ever judged off screen. A
  // requestAnimationFrame satisfied neither reliably, which is why the first
  // attempt at this reported success and moved nothing.
  useFrame(() => {
    if (fittedRef.current) return
    if (fitRef.current?.() === true) fittedRef.current = true
  })

  return null
}
