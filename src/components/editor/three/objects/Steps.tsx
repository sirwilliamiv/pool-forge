'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { plasterShallow } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
  risers?: number
}

export function Steps({ shape, risers = 3 }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)

  const stepWidth = Math.max(2, w)
  const stepDepth = Math.max(0.6, h / risers)

  return (
    <group
      ref={ref}
      position={[feet(shape.x), 0, feet(shape.y)]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      {Array.from({ length: risers }).map((_, i) => {
        const sw = stepWidth - i * 0.5
        const sh = 0.4 + i * 0.5
        const sd = stepDepth - i * 0.1
        return (
          <mesh
            key={i}
            position={[sw / 2 + 0.1, -3.5 + i * 1.0, h - i * (stepDepth + 0.2) - sd / 2]}
            material={plasterShallow}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[sw, sh, sd]} />
          </mesh>
        )
      })}
    </group>
  )
}

export default Steps
