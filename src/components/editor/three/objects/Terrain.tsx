'use client'

import { useMemo } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { elevationAt, sampleGrade, type Bounds, type SiteGrade } from '@/modules/editor/grade/model'

// The ground.
//
// There was none: the site was implicitly a flat plane at zero, so a yard that
// falls three feet to the back fence looked identical to a level pad. This is
// the surface everything else now sits on.

interface Props {
  grade: SiteGrade
  bounds: Bounds
  /**
   * Where the existing ground was, so cut and fill can be seen rather than only
   * costed. Omitted when nothing is being compared.
   */
  existing?: SiteGrade | undefined
  /** Contour interval in feet. Zero draws none. */
  contourIntervalFt?: number
}

/** Sample spacing in inches. Two feet reads as a lawn without melting the tab. */
const STEP_INCHES = 24

export function Terrain({ grade, bounds, existing, contourIntervalFt = 1 }: Props) {
  const geometry = useMemo(() => {
    const sample = sampleGrade(grade, bounds, STEP_INCHES)
    const geo = new THREE.PlaneGeometry(
      feet(bounds.width),
      feet(bounds.height),
      sample.cols - 1,
      sample.rows - 1,
    )

    // PlaneGeometry is built in XY and laid flat, so the height goes into Z
    // before the rotation rather than into Y after it.
    const position = geo.attributes['position'] as THREE.BufferAttribute
    for (let i = 0; i < position.count; i++) {
      const col = i % sample.cols
      const row = Math.floor(i / sample.cols)
      // Rows run the other way once the plane is rotated onto the ground.
      const height = sample.heights[(sample.rows - 1 - row) * sample.cols + col] ?? 0
      position.setZ(i, height)
    }

    geo.rotateX(-Math.PI / 2)
    geo.computeVertexNormals()
    return geo
  }, [grade, bounds])

  /**
   * Where the ground moved, drawn on it.
   *
   * Cut is the number a customer argues about, and a colour on the lawn makes
   * it a conversation rather than a line item nobody can picture.
   */
  const colours = useMemo(() => {
    if (!existing) return null
    const sample = sampleGrade(grade, bounds, STEP_INCHES)
    const values = new Float32Array(sample.cols * sample.rows * 3)

    for (let row = 0; row < sample.rows; row++) {
      for (let col = 0; col < sample.cols; col++) {
        const index = row * sample.cols + col
        const x = bounds.x + col * sample.step
        const y = bounds.y + row * sample.step
        const change = (sample.heights[index] ?? 0) - elevationAt(existing, x, y)

        // Warm where soil comes out, cool where it goes in, unpainted where the
        // ground is untouched. Half a foot is roughly where a builder starts
        // caring.
        const strength = Math.min(1, Math.abs(change) / 2)
        const target = index * 3
        if (change < -0.05) {
          values[target] = 0.85
          values[target + 1] = 0.65 - strength * 0.35
          values[target + 2] = 0.45 - strength * 0.35
        } else if (change > 0.05) {
          values[target] = 0.55 - strength * 0.3
          values[target + 1] = 0.72
          values[target + 2] = 0.85
        } else {
          values[target] = 0.76
          values[target + 1] = 0.82
          values[target + 2] = 0.68
        }
      }
    }
    return values
  }, [grade, bounds, existing])

  const geometryWithColour = useMemo(() => {
    if (!colours) return geometry
    const geo = geometry.clone()
    geo.setAttribute('color', new THREE.BufferAttribute(colours, 3))
    return geo
  }, [geometry, colours])

  const contours = useMemo(() => {
    if (!contourIntervalFt || contourIntervalFt <= 0) return null
    return contourLines(grade, bounds, contourIntervalFt)
  }, [grade, bounds, contourIntervalFt])

  return (
    <group
      name="terrain"
      position={[feet(bounds.x + bounds.width / 2), 0, feet(bounds.y + bounds.height / 2)]}
    >
      <mesh geometry={geometryWithColour} receiveShadow>
        <meshStandardMaterial
          color={colours ? '#ffffff' : '#c3d6ab'}
          vertexColors={Boolean(colours)}
          roughness={0.95}
          metalness={0}
        />
      </mesh>
      {contours && <primitive object={contours} />}
    </group>
  )
}

/**
 * Contours, derived rather than entered.
 *
 * A builder has spot heights, not contour lines; the lines are how the rest of
 * us read them. Drawn as short segments where the sampled surface crosses each
 * level, which is enough to see the fall without a marching-squares
 * implementation nobody would maintain.
 */
function contourLines(grade: SiteGrade, bounds: Bounds, intervalFt: number): THREE.LineSegments {
  const sample = sampleGrade(grade, bounds, STEP_INCHES)
  const vertices: number[] = []

  const halfWidth = feet(bounds.width) / 2
  const halfHeight = feet(bounds.height) / 2
  const stepX = feet(bounds.width) / (sample.cols - 1)
  const stepZ = feet(bounds.height) / (sample.rows - 1)

  const crossing = (a: number, b: number): number | null => {
    const lower = Math.min(a, b)
    const upper = Math.max(a, b)
    const level = Math.ceil(lower / intervalFt) * intervalFt
    if (level > upper || upper - lower < 1e-6) return null
    return (level - a) / (b - a)
  }

  for (let row = 0; row < sample.rows; row++) {
    for (let col = 0; col < sample.cols; col++) {
      const here = sample.heights[row * sample.cols + col] ?? 0
      const x = -halfWidth + col * stepX
      const z = -halfHeight + row * stepZ

      if (col + 1 < sample.cols) {
        const next = sample.heights[row * sample.cols + col + 1] ?? 0
        const t = crossing(here, next)
        if (t !== null) {
          const height = here + (next - here) * t
          vertices.push(x + stepX * t, height + 0.02, z, x + stepX * t, height + 0.02, z + stepZ * 0.35)
        }
      }

      if (row + 1 < sample.rows) {
        const below = sample.heights[(row + 1) * sample.cols + col] ?? 0
        const t = crossing(here, below)
        if (t !== null) {
          const height = here + (below - here) * t
          vertices.push(x, height + 0.02, z + stepZ * t, x + stepX * 0.35, height + 0.02, z + stepZ * t)
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  return new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: '#6b7f5a', transparent: true, opacity: 0.6 }),
  )
}
