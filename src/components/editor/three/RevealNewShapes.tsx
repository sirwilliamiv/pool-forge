'use client'

import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { framingFor } from '@/modules/editor/framing'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { addedIds, boxCorners, fullyVisible } from '@/modules/editor/visibility'

/**
 * Bring a newly added object into view, if it is not already.
 *
 * Adding from the stencil panel, the palette or by voice places the object
 * beside the drawing rather than under a pointer, which is correct in world
 * coordinates and invisible in practice once the camera has been moved or the
 * drawing has grown. People asked for a spa and watched nothing happen.
 *
 * Deliberately conditional. Something placed by pointer is on screen already,
 * and yanking the camera mid-drag would be a worse bug than the one being
 * fixed, so the check is what the camera can currently see rather than where
 * the object came from. No flags to pass and nothing for a caller to remember.
 *
 * Lives inside the Canvas because that is where the camera is. The arithmetic
 * is in `visibility.ts` and tested without one.
 */
export function RevealNewShapes() {
  const camera = useThree(state => state.camera)
  /** Ids already accounted for, so only genuinely new objects are considered. */
  const knownRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    function check(shapes: ReturnType<typeof useShapesStore.getState>['shapes']): void {
      // First run is the drawing loading from the database. Framing on that
      // would fight the initial camera pose the editor sets on open.
      if (knownRef.current === null) {
        knownRef.current = new Set(shapes.map(shape => shape.id))
        return
      }

      const added = addedIds(knownRef.current, shapes)
      knownRef.current = new Set(shapes.map(shape => shape.id))
      if (added.length === 0) return

      // The last one added is the one to look at. Adding several at once (a
      // palette row can) frames the newest rather than arguing about which.
      const newest = added[added.length - 1]
      const shape = shapes.find(item => item.id === newest)
      if (!shape || shape.hidden) return

      const box = { x: feet(shape.x), y: feet(shape.y), width: feet(shape.width), height: feet(shape.height) }
      const projected = boxCorners(box).map(([x, y, z]) => {
        const point = new THREE.Vector3(x, y, z).project(camera)
        return { x: point.x, y: point.y, z: point.z }
      })
      if (fullyVisible(projected)) return

      const { pose, target } = framingFor({
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
      })
      useCameraStore.getState().frameSelection(pose, target)
    }

    check(useShapesStore.getState().shapes)
    return useShapesStore.subscribe(state => {
      check(state.shapes)
    })
  }, [camera])

  return null
}
