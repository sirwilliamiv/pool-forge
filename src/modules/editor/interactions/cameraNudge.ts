/**
 * Command-driven camera movement: the zoom and pan a user asks for with a
 * button, a hotkey or their voice, as opposed to the ones they drag out with a
 * pointer.
 *
 * This lives outside the R3F component tree deliberately. `CustomOrbit` owns
 * the live camera, but a component that can only run inside a WebGL canvas
 * cannot be checked, and `canvas.zoom.in` shipped twice reporting success while
 * moving nothing precisely because the only thing under test was a Zustand
 * field nobody read. Everything here takes a real THREE camera and can be run
 * against one with no WebGL context at all.
 */

import * as THREE from 'three'

import {
  clampDistance,
  clampOrthoZoom,
  orthoPanSpeed,
  perspectivePanSpeed,
  sphericalToPosition,
  type SphericalState,
} from './orbit'
import { useCameraStore, type CameraNudge } from '@/modules/editor/state/cameraStore'

/** The orbit pose CustomOrbit carries between frames. Mutated in place. */
export interface OrbitFrame {
  spherical: SphericalState
  target: THREE.Vector3
}

/** Put the camera at its spherical pose about the target. */
export function placeCamera(
  camera: THREE.Camera,
  sph: SphericalState,
  target: THREE.Vector3,
): void {
  const [x, y, z] = sphericalToPosition(sph, [target.x, target.y, target.z])
  camera.position.set(x, y, z)
  camera.lookAt(target)
  camera.updateMatrixWorld()
}

/**
 * Screen right and screen up in world space, read off the camera's own basis.
 *
 * Columns 0 and 1 of the world matrix are the camera's local X and Y, which are
 * screen-right and screen-up for any camera in any orientation. Deriving them
 * instead from `cross(lookDirection, camera.up)` collapses to a zero vector the
 * moment the camera looks straight down its own up axis, and a normalized zero
 * vector pans by exactly nothing.
 */
function screenAxes(camera: THREE.Camera): { right: THREE.Vector3; up: THREE.Vector3 } {
  camera.updateMatrixWorld()
  return {
    right: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize(),
    up: new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize(),
  }
}

/**
 * Zoom by a factor: greater than 1 moves in, less than 1 moves out.
 *
 * The two camera kinds keep their zoom in completely different places, so this
 * has to branch on the kind rather than write one field.
 *
 * Plan and section run an orthographic camera, which has no perspective to
 * exploit: nothing about the picture changes when it moves along its own view
 * axis, so zoom is a scale on the projection (`camera.zoom`, larger is closer)
 * and the camera does not move at all.
 *
 * 3D runs a perspective camera with a fixed field of view. Writing `camera.zoom`
 * there would stretch the projection and fight the FOV rather than move the
 * eye, so its zoom is the orbit distance from the target: dividing the distance
 * by the factor moves the eye in.
 *
 * Both ends clamp (`ORTHO_ZOOM_MIN/MAX`, `MIN_DISTANCE/MAX_DISTANCE`), so no
 * number of zoom-outs can push the drawing to a speck or invert the view by
 * driving the scale or the distance through zero.
 */
export function zoomCamera(camera: THREE.Camera, frame: OrbitFrame, factor: number): void {
  if (factor <= 0 || !Number.isFinite(factor)) return
  if (camera instanceof THREE.OrthographicCamera) {
    camera.zoom = clampOrthoZoom(camera.zoom * factor)
    camera.updateProjectionMatrix()
    return
  }
  frame.spherical.distance = clampDistance(frame.spherical.distance / factor)
  placeCamera(camera, frame.spherical, frame.target)
}

/**
 * Pan the viewport by a screen-space offset in pixels: +dx moves the view
 * right, +dy moves the view down. That is the opposite sign to a pointer drag,
 * where the drawing follows the cursor; "pan right" means show me what is
 * further right, not drag the drawing rightwards.
 */
export function panCamera(
  camera: THREE.Camera,
  frame: OrbitFrame,
  dx: number,
  dy: number,
): void {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
  if (dx === 0 && dy === 0) return

  if (camera instanceof THREE.OrthographicCamera) {
    // Plan / section: the camera and its target slide together across the
    // drawing. Speed scales inversely with zoom so a pan of N pixels covers the
    // same amount of screen whatever the zoom level.
    const speed = orthoPanSpeed(camera.zoom)
    const { right, up } = screenAxes(camera)
    const move = new THREE.Vector3()
      .addScaledVector(right, dx * speed)
      .addScaledVector(up, -dy * speed)
    camera.position.add(move)
    frame.target.add(move)
    camera.updateMatrixWorld()
    return
  }

  // 3D: slide the orbit target across the ground plane, then re-place the
  // camera around it. The target stays on the ground so a later orbit still
  // turns about the drawing rather than about a point floating in the air.
  const { right } = screenAxes(camera)
  right.y = 0
  right.normalize()
  const forward = new THREE.Vector3(0, 1, 0).cross(right).normalize()
  const speed = perspectivePanSpeed(frame.spherical.distance)
  frame.target.addScaledVector(right, dx * speed).addScaledVector(forward, -dy * speed)
  placeCamera(camera, frame.spherical, frame.target)
}

/** Apply one queued nudge from the camera store to the live camera. */
export function applyCameraNudge(
  camera: THREE.Camera,
  frame: OrbitFrame,
  nudge: CameraNudge,
): void {
  if (nudge.zoom !== 1) zoomCamera(camera, frame, nudge.zoom)
  panCamera(camera, frame, nudge.panX, nudge.panY)
}

/**
 * Wire a live camera to the zoom/pan commands.
 *
 * `canvas.zoom.in`, `canvas.zoom.out` and `canvas.pan` push a nudge into
 * `useCameraStore` exactly as `camera.set.view` and `canvas.fit` push a pose,
 * and this is the reader that turns one into camera movement. Nudges are keyed
 * on a token rather than their values because two identical zoom-ins in a row
 * are two separate requests.
 *
 * `onNudge` runs before the movement is applied, so the caller can cancel an
 * in-flight view transition that would otherwise animate straight over it.
 */
export function subscribeCameraNudges(
  camera: THREE.Camera,
  frame: OrbitFrame,
  onNudge?: () => void,
): () => void {
  return useCameraStore.subscribe((state, previous) => {
    if (state.nudgeToken === previous.nudgeToken) return
    const nudge = state.nudge
    if (!nudge) return
    onNudge?.()
    applyCameraNudge(camera, frame, nudge)
  })
}
