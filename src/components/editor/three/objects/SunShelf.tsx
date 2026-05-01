'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { plasterShallow, sunShelfWater } from '../Materials'

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

  const water = sunShelfWater

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
