/**
 * Camera orbit maths: clamps, wheel response, view poses and the spherical
 * placement of the camera. Pulled out of CustomOrbit so the limits that stop a
 * user from flying under the ground or losing the drawing off screen can be
 * checked without a WebGL context.
 */

import type { CameraView } from '@/modules/editor/state/cameraStore'

export interface SphericalState {
  azimuth: number
  polar: number
  distance: number
}

export type Vec3Tuple = [number, number, number]

/** Never look from exactly overhead (gimbal) or from below the ground plane. */
export const POLAR_MIN = 0.01
export const POLAR_MAX = Math.PI / 2 - 0.01
export const TRANSITION_MS = 300
export const ROTATE_SPEED = 0.005
export const PAN_SPEED_FACTOR = 0.0015
export const ZOOM_FACTOR = 0.001
export const MIN_DISTANCE = 5
export const MAX_DISTANCE = 300
export const ORTHO_ZOOM_MIN = 2
export const ORTHO_ZOOM_MAX = 400
/** World units per wheel tick at zoom = 1 (ortho) or MIN_DISTANCE (perspective). */
export const WHEEL_PAN_FACTOR = 0.05

export const ISO_DEFAULT: SphericalState = {
  azimuth: -0.756,
  polar: 0.92,
  distance: 65.9,
}

export const VIEW_POSES: Record<
  CameraView,
  { spherical: SphericalState; target: Vec3Tuple }
> = {
  iso: { spherical: { ...ISO_DEFAULT }, target: [0, -1, 0] },
  top: { spherical: { azimuth: 0, polar: 0.05, distance: 60 }, target: [0, 0, 0] },
  front: { spherical: { azimuth: 0, polar: POLAR_MAX, distance: 50 }, target: [0, 0, 0] },
  left: {
    spherical: { azimuth: -Math.PI / 2, polar: POLAR_MAX, distance: 50 },
    target: [0, 0, 0],
  },
  right: {
    spherical: { azimuth: Math.PI / 2, polar: POLAR_MAX, distance: 50 },
    target: [0, 0, 0],
  },
}

export function clampPolar(polar: number): number {
  return Math.max(POLAR_MIN, Math.min(POLAR_MAX, polar))
}

export function clampDistance(distance: number): number {
  return Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, distance))
}

export function clampOrthoZoom(zoom: number): number {
  return Math.max(ORTHO_ZOOM_MIN, Math.min(ORTHO_ZOOM_MAX, zoom))
}

/**
 * What a press does: rotate the 3D camera, pan, or nothing.
 *
 * Right button and shift both mean pan everywhere. Orthographic views (plan and
 * section) never rotate, because a plan drawing that has been tilted is no
 * longer a plan drawing.
 */
export function resolveDragMode(
  e: { button: number; shiftKey?: boolean },
  isOrtho: boolean,
): 'rotate' | 'pan' | null {
  if (e.button === 2 || e.shiftKey === true || isOrtho) return 'pan'
  if (e.button === 0) return 'rotate'
  return null
}

/** Orbit by a pointer delta in pixels. Polar is clamped, azimuth wraps freely. */
export function rotateSpherical(
  sph: SphericalState,
  dx: number,
  dy: number,
): SphericalState {
  return {
    azimuth: sph.azimuth - dx * ROTATE_SPEED,
    polar: clampPolar(sph.polar - dy * ROTATE_SPEED),
    distance: sph.distance,
  }
}

/** Wheel zoom for the 3D camera: scroll down pulls back, and both ends clamp. */
export function zoomDistance(distance: number, deltaY: number): number {
  return clampDistance(distance * Math.exp(deltaY * ZOOM_FACTOR))
}

/** Wheel zoom for plan/section. Ortho zoom is inverted: bigger zoom is closer. */
export function zoomOrthoLevel(zoom: number, deltaY: number): number {
  return clampOrthoZoom(zoom * Math.exp(-deltaY * ZOOM_FACTOR))
}

/** Pan distance per pixel of drag, so the drawing tracks the cursor at any zoom. */
export function orthoPanSpeed(zoom: number): number {
  return 1 / Math.max(0.0001, zoom)
}

export function perspectivePanSpeed(distance: number): number {
  return distance * PAN_SPEED_FACTOR
}

/** Camera position for a spherical pose about a target. */
export function sphericalToPosition(
  sph: SphericalState,
  target: Vec3Tuple,
): Vec3Tuple {
  const sinPolar = Math.sin(sph.polar)
  const cosPolar = Math.cos(sph.polar)
  return [
    target[0] + sph.distance * sinPolar * Math.cos(sph.azimuth),
    target[1] + sph.distance * cosPolar,
    target[2] + sph.distance * sinPolar * Math.sin(sph.azimuth),
  ]
}

/**
 * Spherical pose for a cartesian camera position about a target, used by
 * "frame the selection".
 *
 * The height ratio is clamped before acos: a pose one floating-point step
 * outside the sphere would otherwise produce NaN and park the camera nowhere.
 * A pose level with its target (dy = 0) is a horizontal view, not a plan view.
 */
export function poseToSpherical(pose: Vec3Tuple, target: Vec3Tuple): SphericalState {
  const dx = pose[0] - target[0]
  const dy = pose[1] - target[1]
  const dz = pose[2] - target[2]
  const distance = clampDistance(Math.hypot(dx, dy, dz))
  const ratio = Math.max(-1, Math.min(1, dy / distance))
  return {
    azimuth: Math.atan2(dz, dx),
    polar: clampPolar(Math.acos(ratio)),
    distance,
  }
}

export function easeInOutQuad(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
}

/** Eased 0..1 progress through a view transition. */
export function transitionEase(
  elapsedMs: number,
  durationMs: number = TRANSITION_MS,
): number {
  return easeInOutQuad(Math.max(0, Math.min(1, elapsedMs / durationMs)))
}

export function lerpSpherical(
  start: SphericalState,
  end: SphericalState,
  ease: number,
): SphericalState {
  return {
    azimuth: start.azimuth + (end.azimuth - start.azimuth) * ease,
    polar: start.polar + (end.polar - start.polar) * ease,
    distance: start.distance + (end.distance - start.distance) * ease,
  }
}
