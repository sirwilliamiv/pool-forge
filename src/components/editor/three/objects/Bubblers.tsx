'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'

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

  const stone = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.85 }),
    [],
  )
  const fountain = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.45,
        roughness: 0.1,
        transmission: 0.7,
      }),
    [],
  )
  const droplet = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.6,
        roughness: 0.05,
        transmission: 0.6,
      }),
    [],
  )

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
