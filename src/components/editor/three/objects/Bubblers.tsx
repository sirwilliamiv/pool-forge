'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { bubblerStone, bubblerFountain, bubblerDroplet } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
  count?: number
}

interface BubblerProps {
  position: [number, number, number]
  stone: THREE.Material
  fountain: THREE.Material
  droplet: THREE.Material
}

function Bubbler({ position, stone, fountain, droplet }: BubblerProps) {
  return (
    <group position={position}>
      <mesh position={[0, -0.4, 0]} material={stone} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 0.1, 24]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} material={fountain}>
        <coneGeometry args={[0.45, 1.2, 24, 1, true]} />
      </mesh>
      {Array.from({ length: 4 }).map((_, i) => (
        <mesh
          key={i}
          position={[(i - 1.5) * 0.12, 0.6 + i * 0.4, ((i % 2) - 0.5) * 0.2]}
          material={droplet}
        >
          <sphereGeometry args={[0.08 - i * 0.015, 12, 12]} />
        </mesh>
      ))}
    </group>
  )
}

export function Bubblers({ shape, count = 2 }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const stone = bubblerStone
  const fountain = bubblerFountain
  const droplet = bubblerDroplet

  const w = feet(shape.width)

  return (
    <group ref={ref} position={[feet(shape.x), 0, feet(shape.y)]}>
      {Array.from({ length: count }).map((_, i) => (
        <Bubbler
          key={i}
          position={[(i - (count - 1) / 2) * (w / Math.max(1, count)) || 0, 0, 0]}
          stone={stone}
          fountain={fountain}
          droplet={droplet}
        />
      ))}
    </group>
  )
}

export default Bubblers
