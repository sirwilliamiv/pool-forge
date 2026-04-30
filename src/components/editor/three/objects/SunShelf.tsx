'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'

interface Props {
  shape: Shape
  materialId?: string
}

export function SunShelf({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)

  const plasterShallow = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.4 }),
    [],
  )
  const water = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.8,
        roughness: 0.05,
        transmission: 0.5,
        clearcoat: 1.0,
      }),
    [],
  )

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh position={[0, -1.25, 0]} material={plasterShallow} castShadow receiveShadow>
        <boxGeometry args={[w, 2.5, h]} />
      </mesh>
      <mesh
        position={[0, 0.08, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={water}
        receiveShadow
      >
        <planeGeometry args={[w * 0.95, h * 0.93]} />
      </mesh>
    </group>
  )
}

export default SunShelf
