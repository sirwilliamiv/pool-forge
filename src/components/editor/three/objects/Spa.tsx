'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { spaBody, spaSkirt, spaWaterPhysical, spaCoping } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

export function Spa({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)
  const radius = Math.min(w, h) / 2
  const skirtRadius = radius + 0.7
  const spaHeight = 1.5

  const body = spaBody
  const stone = spaSkirt
  const water = spaWaterPhysical
  const coping = spaCoping

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh position={[0, -spaHeight / 2 + 0.3, 0]} material={body} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius, spaHeight, 48, 1, true]} />
      </mesh>
      <mesh
        position={[0, -spaHeight + 0.3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={body}
        receiveShadow
      >
        <circleGeometry args={[radius, 48]} />
      </mesh>
      <mesh position={[0, -0.25, 0]} material={stone} castShadow receiveShadow>
        <cylinderGeometry args={[skirtRadius, skirtRadius, 1.5, 48, 1, true]} />
      </mesh>
      <mesh position={[0, 0.32, 0]} rotation={[-Math.PI / 2, 0, 0]} material={water} receiveShadow>
        <circleGeometry args={[radius - 0.05, 48]} />
      </mesh>
      <mesh position={[0, 0.35, 0]} rotation={[-Math.PI / 2, 0, 0]} material={coping}>
        <ringGeometry args={[radius - 0.05, radius + 0.05, 48]} />
      </mesh>
    </group>
  )
}

export default Spa
