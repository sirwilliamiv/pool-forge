'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { loungerWood } from '../Materials'

interface LoungerSpec {
  x: number
  z: number
  rotation?: number
}

interface Props {
  shape?: Shape
  position?: [number, number, number]
  loungers?: LoungerSpec[]
  materialId?: string
}

interface LoungerProps {
  spec: LoungerSpec
  wood: THREE.Material
}

function Lounger({ spec, wood }: LoungerProps) {
  return (
    <group position={[spec.x, 0.5, spec.z]} rotation={[0, spec.rotation ?? 0, 0]}>
      <mesh position={[0, 0.7, 0]} material={wood} castShadow>
        <boxGeometry args={[1.8, 0.2, 0.7]} />
      </mesh>
      <mesh position={[-0.55, 0.95, 0]} rotation={[0, 0, -0.4]} material={wood} castShadow>
        <boxGeometry args={[0.7, 0.2, 0.7]} />
      </mesh>
      <mesh position={[-0.7, 0.3, 0]} material={wood} castShadow>
        <boxGeometry args={[0.1, 0.6, 0.7]} />
      </mesh>
      <mesh position={[0.7, 0.3, 0]} material={wood} castShadow>
        <boxGeometry args={[0.1, 0.6, 0.7]} />
      </mesh>
    </group>
  )
}

export function Loungers({
  shape,
  position = [0, 0, 0],
  loungers = [
    { x: -18, z: -10, rotation: 0.2 },
    { x: -15, z: -10.5, rotation: 0.2 },
  ],
}: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current && shape) ref.current.userData.id = shape.id
  }, [shape])

  const wood = loungerWood

  const rootPosition: [number, number, number] = shape
    ? [feet(shape.x), 0, feet(shape.y)]
    : position

  return (
    <group ref={ref} position={rootPosition}>
      {loungers.map((spec, i) => (
        <Lounger key={i} spec={spec} wood={wood} />
      ))}
    </group>
  )
}

export default Loungers
