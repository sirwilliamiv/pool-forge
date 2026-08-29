'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { houseWallStucco } from '../Materials'

interface Props {
  shape?: Shape
  position?: [number, number, number]
  size?: [number, number, number]
  materialId?: string
}

/** How tall a wall stands when nothing says otherwise, in feet. */
const WALL_HEIGHT = 14

/**
 * The house the pool is built against.
 *
 * Places itself from the shape, and carries the shape's id so the picker can
 * find it. It used to be rendered without its shape at all, which meant the
 * group had no `userData.id`: the picker walked straight past it, and the wall
 * could not be selected, dragged or resized. It looked like scenery because,
 * as far as every interaction was concerned, it was.
 *
 * The box is centred on its own origin, so the group sits at the footprint's
 * centre rather than its corner. Placing it at the corner would put half the
 * wall outside the outline the selection draws.
 */
export function HouseWall({ shape, position = [0, WALL_HEIGHT / 2, 22], size = [60, WALL_HEIGHT, 8] }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current && shape) ref.current.userData.id = shape.id
  }, [shape])

  const rootPosition: [number, number, number] = shape
    ? [feet(shape.x + shape.width / 2), WALL_HEIGHT / 2, feet(shape.y + shape.height / 2)]
    : position

  // Sized from the shape when there is one, so dragging a resize handle moves
  // the wall rather than the outline alone.
  const boxSize: [number, number, number] = shape
    ? [feet(shape.width), WALL_HEIGHT, feet(shape.height)]
    : size

  const rotation = useMemo<[number, number, number]>(
    () => [0, -(((shape?.rotation ?? 0) * Math.PI) / 180), 0],
    [shape?.rotation],
  )

  return (
    <group ref={ref} position={rootPosition} rotation={rotation}>
      <mesh material={houseWallStucco} castShadow receiveShadow>
        <boxGeometry args={boxSize} />
      </mesh>
    </group>
  )
}

export default HouseWall
