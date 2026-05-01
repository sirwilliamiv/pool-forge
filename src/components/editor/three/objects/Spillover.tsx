'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'
import {
  spilloverSpoutGlow,
  spilloverSpoutNeutral,
  spilloverWater,
} from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

export function Spillover({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  const flags = usePresentationFlags()
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const spout = flags.showValidationGlows
    ? spilloverSpoutGlow
    : spilloverSpoutNeutral
  const water = spilloverWater

  return (
    <group ref={ref} position={[feet(shape.x), 0.1, feet(shape.y)]}>
      <mesh material={spout}>
        <boxGeometry args={[0.3, 0.3, 1.2]} />
      </mesh>
      <mesh position={[-0.1, -0.15, 0]} rotation={[Math.PI / 2.4, 0, 0]} material={water}>
        <planeGeometry args={[1.0, 0.6]} />
      </mesh>
    </group>
  )
}

export default Spillover
