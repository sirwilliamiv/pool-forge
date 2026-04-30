'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { waterDefault } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

export function Water({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)

  const water = waterDefault

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, -0.32, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={water} receiveShadow>
        <planeGeometry args={[w * 0.987, h * 0.973]} />
      </mesh>
    </group>
  )
}

export default Water
