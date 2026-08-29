import * as THREE from 'three'

import { clientToNdc } from '@/modules/editor/interactions/pointer'

const _ndc = new THREE.Vector2()

/**
 * Nearest selectable object id under the cursor: raycast from the camera and
 * walk up to the first ancestor carrying a string `userData.id`. Shared by the
 * editor's pointer handlers (drag, selection, tool gestures) so this pick logic
 * lives in one place instead of being copy-pasted per handler.
 */
export function pickShapeId(
  raycaster: THREE.Raycaster,
  camera: THREE.Camera,
  scene: THREE.Object3D,
  dom: HTMLElement,
  clientX: number,
  clientY: number,
): string | null {
  const screen = clientToNdc(clientX, clientY, dom.getBoundingClientRect())
  // A canvas with no width (collapsed panel, pre-layout) can hold nothing to
  // pick, and the raw conversion would hand the raycaster a NaN ray.
  if (!screen) return null
  _ndc.set(screen.x, screen.y)
  raycaster.setFromCamera(_ndc, camera)
  const hits = raycaster.intersectObjects(scene.children, true)
  for (const hit of hits) {
    let obj: THREE.Object3D | null = hit.object
    while (obj) {
      const id = obj.userData?.id
      if (typeof id === 'string') return id
      obj = obj.parent
    }
  }
  return null
}
