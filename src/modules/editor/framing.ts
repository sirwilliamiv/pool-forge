import { feet } from '@/lib/three/units'

import type { Vec3 } from './state/cameraStore'

// Putting the camera where a box fills the view.
//
// Shared by "frame the selection" and "fit everything", which were about to be
// two copies of the same trigonometry. A fit that framed differently from a
// frame would look like a bug in whichever one the user tried second.

export interface Box {
  /** Inches, canvas space. */
  x: number
  y: number
  width: number
  height: number
}

/** Matches the ISO default, so framing does not swing the camera to a new angle. */
const ELEVATION = 0.5
const AZIMUTH = -0.756

/** Never closer than this, or a single small symbol fills the screen. */
const MIN_RADIUS = 8
const MIN_DISTANCE = 15

export interface CameraFraming {
  pose: Vec3
  target: Vec3
}

/**
 * A camera pose that frames `box`, with padding.
 *
 * `padding` is a fraction of the box: 0.15 leaves a comfortable margin so the
 * outermost object is not flush against the edge of the viewport.
 */
export function framingFor(box: Box, padding = 0.15): CameraFraming {
  const centreX = feet(box.x + box.width / 2)
  const centreZ = feet(box.y + box.height / 2)
  const sizeX = feet(box.width) * (1 + padding)
  const sizeZ = feet(box.height) * (1 + padding)

  const radius = Math.max(MIN_RADIUS, Math.hypot(sizeX, sizeZ) * 0.7)
  const distance = Math.max(MIN_DISTANCE, radius * 2.6)

  return {
    pose: [
      centreX + distance * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
      distance * Math.sin(ELEVATION),
      centreZ + distance * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
    ],
    target: [centreX, 0, centreZ],
  }
}
