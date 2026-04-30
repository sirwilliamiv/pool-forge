'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { glassMosaicAqua } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

export function TileBand({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)
  const tileH = 0.5
  const tileT = 0.22
  const yPos = -tileH / 2 + 0.01

  const tile = glassMosaicAqua

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh position={[0, yPos, -h / 2 + tileT / 2]} material={tile}>
        <boxGeometry args={[w, tileH, tileT]} />
      </mesh>
      <mesh position={[0, yPos, h / 2 - tileT / 2]} material={tile}>
        <boxGeometry args={[w, tileH, tileT]} />
      </mesh>
      <mesh position={[-w / 2 + tileT / 2, yPos, 0]} material={tile}>
        <boxGeometry args={[tileT, tileH, h]} />
      </mesh>
      <mesh position={[w / 2 - tileT / 2, yPos, 0]} material={tile}>
        <boxGeometry args={[tileT, tileH, h]} />
      </mesh>
    </group>
  )
}

export default TileBand
