'use client'

import { Line } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { useDrawStore } from '@/modules/editor/state/drawStore'
import type { SketchPath } from '@/modules/editor/state/shapes'
import { INK, SPECTRUM } from '@/lib/brand'

/**
 * The ring as a flat fill, for the drop-target wash.
 *
 * Built in the XY plane and laid down by the mesh's own rotation, because
 * THREE.Shape is two dimensional and the plan's y is the world's z.
 */
function fillShape(points: THREE.Vector3[]): THREE.Shape {
  const outline = new THREE.Shape()
  const first = points[0]
  if (!first) return outline
  outline.moveTo(first.x, first.z)
  for (const point of points.slice(1)) outline.lineTo(point.x, point.z)
  outline.closePath()
  return outline
}

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
  // Lit while something is being dragged over it, so the space that will catch
  // the drop is obvious before the drop happens.
  const isDropTarget = useDrawStore(state => state.dropTargetId === shape.id)

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
      {/* The persistent fill a builder actually asked for: a closed outline
          coloured flat in plan. Purely decorative, same mesh setup as the
          drop-target wash below, but it steps aside for that wash rather than
          fighting it for the same pixels while something is being dragged
          over the shape. */}
      {shape.closed && shape.fillColor && points.length > 2 && !isDropTarget ? (
        <mesh
          position={[0, LIFT - 0.02, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <shapeGeometry args={[fillShape(points)]} />
          <meshBasicMaterial
            color={SPECTRUM[shape.fillColor]}
            transparent
            opacity={0.35}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
      {/* A filled wash under the outline while it is a live drop target, so
          the whole area reads as the thing that will catch the object, not just
          its edge. Drawn below the line and never picked, so it cannot swallow
          the drag it is describing. */}
      {isDropTarget && shape.closed && points.length > 2 ? (
        <mesh
          position={[0, LIFT - 0.02, 0]}
          // Laid flat. A THREE.Shape is built in XY, and +90 degrees about X is
          // the rotation that carries its y to world +z: -90 would mirror the
          // wash about the outline it is meant to fill.
          rotation={[Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <shapeGeometry args={[fillShape(points)]} />
          <meshBasicMaterial
            color={SPECTRUM.orange}
            transparent
            opacity={0.18}
            depthWrite={false}
            // That rotation points the face down, and the plan view looks down
            // at it. Single-sided, the wash would simply not be there.
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : null}
      <Line
        points={points}
        color={isDropTarget ? SPECTRUM.orange : shape.closed ? SPECTRUM.blue : INK.slate}
        lineWidth={isDropTarget ? 4 : 2}
        dashed={!shape.closed}
        dashSize={0.6}
        gapSize={0.35}
      />
    </group>
  )
}
