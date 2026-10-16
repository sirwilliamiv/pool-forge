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

/** Faint enough to read as "not decided yet", present enough to see and to click. */
const CLOSED_FILL_OPACITY = 0.12

/**
 * A drawn line or outline, in the scene.
 *
 * An outline is drawn as its line plus a faint wash, not as a surface, because
 * that is what it is: construction geometry, not an object that has been
 * decided on yet. A closed sketch that looked like a deck would be
 * indistinguishable from a deck, and the whole point of the convert step is
 * that the two are different until somebody says otherwise. The wash is there
 * so a small imported outline (a 2' waterfall, a set of steps) can be seen at
 * all and clicked anywhere inside, not only on its hairline edge.
 *
 * Points are inches relative to the shape's top-left. The group sits at the
 * box centre and carries the rotation, so turning an outline turns it about
 * the same point the handles turn about; before this the rotation was simply
 * not drawn.
 */
export function SketchPathObject({ shape }: { shape: SketchPath }) {
  // Lit while something is being dragged over it, so the space that will catch
  // the drop is obvious before the drop happens.
  const isDropTarget = useDrawStore(state => state.dropTargetId === shape.id)

  const points = useMemo(() => {
    const cx = shape.width / 2
    const cy = shape.height / 2
    const local = shape.points.map(p => new THREE.Vector3(feet(p.x - cx), LIFT, feet(p.y - cy)))
    // A closed ring stores each vertex once, so the segment back to the start
    // has to be added for drawing. Storing the repeat instead would mean every
    // area and perimeter calculation had to remember to ignore it.
    const first = local[0]
    if (shape.closed && first && local.length > 2) local.push(first.clone())
    return local
  }, [shape.points, shape.width, shape.height, shape.closed])

  if (points.length < 2) return null

  const filled = shape.closed && points.length > 2

  return (
    <group
      userData={{ id: shape.id }}
      position={[feet(shape.x + shape.width / 2), 0, feet(shape.y + shape.height / 2)]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      {/* The wash. Faint in the outline's own blue, and orange while it is a
          live drop target so the whole area reads as the thing that will catch
          the object, not just its edge. Pickable, so a click inside the outline
          selects it; the drop targeting is geometric, not a raycast, so the
          wash cannot swallow the drag it is describing. Laid flat: a
          THREE.Shape is built in XY, and +90 degrees about X carries its y to
          world +z. -90 would mirror the wash about the outline it fills. */}
      {filled ? (
        <mesh position={[0, LIFT - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[fillShape(points)]} />
          <meshBasicMaterial
            color={isDropTarget ? SPECTRUM.orange : SPECTRUM.blue}
            transparent
            opacity={isDropTarget ? 0.18 : CLOSED_FILL_OPACITY}
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
