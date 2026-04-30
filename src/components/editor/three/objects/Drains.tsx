'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'

interface Props {
  shape?: Shape
  position?: [number, number, number]
  materialId?: string
  count?: number
}

export function Drains({ shape, position = [0, 0, 0], count = 2 }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current && shape) ref.current.userData.id = shape.id
  }, [shape])

  const grate = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6, metalness: 0.4 }),
    [],
  )

  const rootPosition: [number, number, number] = shape
    ? [feet(shape.x), 0, feet(shape.y)]
    : position

  return (
    <group ref={ref} position={rootPosition}>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          position={[(i - (count - 1) / 2) * 4, -5.4, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={grate}
        >
          <ringGeometry args={[0.25, 0.45, 24]} />
        </mesh>
      ))}
    </group>
  )
}

export default Drains
