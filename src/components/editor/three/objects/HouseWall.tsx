'use client'

import { useEffect, useRef } from 'react'
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

export function HouseWall({ shape, position = [0, 7, 22], size = [60, 14, 8] }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current && shape) ref.current.userData.id = shape.id
  }, [shape])

  const wall = houseWallStucco

  const rootPosition: [number, number, number] = shape
    ? [feet(shape.x), position[1], feet(shape.y)]
    : position

  return (
    <group ref={ref} position={rootPosition}>
      <mesh material={wall} castShadow receiveShadow>
        <boxGeometry args={size} />
      </mesh>
    </group>
  )
}

export default HouseWall
