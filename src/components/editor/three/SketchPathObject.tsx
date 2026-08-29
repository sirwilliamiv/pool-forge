'use client'

import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { SketchPath } from '@/modules/editor/state/shapes'

/** Just above the ground, so a line on the deck is not fighting it for pixels. */
const LIFT = 0.04

/**
 * A drawn line or outline, in the scene.
 *
 * Drawn as a line rather than a filled surface even when closed, because that
 * is what it is: construction geometry, not an object that has been decided on
 * yet. A closed sketch that looked like a deck would be indistinguishable from
 * a deck, and the whole point of the convert step is that the two are different
 * until somebody says otherwise.
 */
export function SketchPathObject({ shape }: { shape: SketchPath }) {
  const points = useMemo(() => {
    const world = shape.points.map(
      p => new THREE.Vector3(feet(shape.x + p.x), LIFT, feet(shape.y + p.y)),
    )
    // A closed ring stores each vertex once, so the segment back to the start
    // has to be added for drawing. Storing the repeat instead would mean every
    // area and perimeter calculation had to remember to ignore it.
    const first = world[0]
    if (shape.closed && first && world.length > 2) world.push(first.clone())
    return world
  }, [shape.points, shape.x, shape.y, shape.closed])

  if (points.length < 2) return null

  return (
    <group userData={{ id: shape.id }}>
      <Line
        points={points}
        color={shape.closed ? '#0EA5E9' : '#334155'}
        lineWidth={2}
        dashed={!shape.closed}
        dashSize={0.6}
        gapSize={0.35}
      />
    </group>
  )
}
