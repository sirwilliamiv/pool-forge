'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { ledRing, ledGlow } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
  positions?: Array<{ x: number; z: number; side: 'n' | 's' }>
}

interface LightProps {
  position: [number, number, number]
  rotationY: number
  ring: THREE.Material
  glow: THREE.Material
}

function Light({ position, rotationY, ring, glow }: LightProps) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh material={ring} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.1, 24]} />
      </mesh>
      <mesh material={glow} position={[0, 0, 0.06]}>
        <circleGeometry args={[0.3, 24]} />
      </mesh>
      <pointLight color={0xfef9c3} intensity={0.6} distance={10} decay={2} position={[0, 0, 0.5]} />
    </group>
  )
}

export function LedLights({
  shape,
  positions = [
    { x: 0, z: -7.4, side: 'n' },
    { x: 8, z: -7.4, side: 'n' },
    { x: -4, z: 7.4, side: 's' },
  ],
}: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const ring = ledRing
  const glow = ledGlow

  return (
    <group ref={ref} position={[feet(shape.x), 0, feet(shape.y)]}>
      {positions.map((p, i) => (
        <Light
          key={i}
          position={[p.x, -2.0, p.z]}
          rotationY={p.side === 's' ? Math.PI : 0}
          ring={ring}
          glow={glow}
        />
      ))}
    </group>
  )
}

export default LedLights
