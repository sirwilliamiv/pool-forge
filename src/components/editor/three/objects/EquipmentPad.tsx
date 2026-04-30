'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'

interface Props {
  shape?: Shape
  position?: [number, number, number]
  materialId?: string
}

export function EquipmentPad({ shape, position = [-30, 0, 18] }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current && shape) ref.current.userData.id = shape.id
  }, [shape])

  const pad = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xc8c2b5, roughness: 0.9 }),
    [],
  )
  const heater = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.6, metalness: 0.3 }),
    [],
  )
  const filter = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.3 }),
    [],
  )
  const pump = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.4, metalness: 0.4 }),
    [],
  )

  const rootPosition: [number, number, number] = shape
    ? [feet(shape.x), 0, feet(shape.y)]
    : position

  return (
    <group ref={ref} position={rootPosition}>
      <mesh position={[0, 0.2, 0]} material={pad} castShadow receiveShadow>
        <boxGeometry args={[8, 0.4, 4]} />
      </mesh>
      <mesh position={[-1.5, 1.3, 0]} material={heater} castShadow>
        <boxGeometry args={[2, 2.2, 1.5]} />
      </mesh>
      <mesh position={[1.2, 1.45, 0]} material={filter} castShadow>
        <cylinderGeometry args={[0.7, 0.8, 2.5, 24]} />
      </mesh>
      <mesh position={[2.8, 0.7, 0]} material={pump} castShadow>
        <boxGeometry args={[1.4, 1.0, 1.2]} />
      </mesh>
    </group>
  )
}

export default EquipmentPad
