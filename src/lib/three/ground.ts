import * as THREE from 'three'

import { clientToNdc } from '@/modules/editor/interactions/pointer'

/**
 * Where a pointer event lands on the ground plane, in world units.
 *
 * Shared rather than copied: the drawing tools and the placement tools have to
 * agree exactly on where a click is, or a line drawn to touch a pool's edge
 * lands a fraction off it and the plan stops closing up.
 */
export function groundPoint(
  event: { clientX: number; clientY: number },
  element: HTMLCanvasElement,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  y = 0,
): THREE.Vector3 | null {
  const screen = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
  if (!screen) return null
  raycaster.setFromCamera(new THREE.Vector2(screen.x, screen.y), camera)
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
  const hit = new THREE.Vector3()
  // Parallel to the plane, which happens in a side elevation: there is no
  // ground point, and answering with a stale vector would drop a vertex at
  // wherever the last successful pick was.
  if (!raycaster.ray.intersectPlane(plane, hit)) return null
  return hit
}
