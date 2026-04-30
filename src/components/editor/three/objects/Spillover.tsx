'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'

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

  const spout = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x9ca3af,
        emissive: flags.showValidationGlows ? 0xef4444 : 0x000000,
        emissiveIntensity: flags.showValidationGlows ? 0.4 : 0,
      }),
    [flags.showValidationGlows],
  )
  const water = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.7,
        roughness: 0.05,
        transmission: 0.6,
      }),
    [],
  )

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
