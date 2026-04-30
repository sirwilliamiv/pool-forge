'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { getMaterial } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

export function PoolWalls({ shape, materialId }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)
  const wallH = 5
  const wallThickness = 0.2

  const plaster = getMaterial(materialId ?? 'pebbletecBlueGranite')

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh
        position={[0, -wallH / 2, -h / 2 + wallThickness / 2]}
        material={plaster}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w, wallH, wallThickness]} />
      </mesh>
      <mesh
        position={[0, -wallH / 2, h / 2 - wallThickness / 2]}
        material={plaster}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w, wallH, wallThickness]} />
      </mesh>
      <mesh
        position={[-w / 2 + wallThickness / 2, -wallH / 2, 0]}
        material={plaster}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallThickness, wallH, h]} />
      </mesh>
      <mesh
        position={[w / 2 - wallThickness / 2, -wallH / 2, 0]}
        material={plaster}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[wallThickness, wallH, h]} />
      </mesh>
      {/* Sloped pool floor */}
      <mesh
        position={[0, -5.5, 0]}
        rotation={[-Math.PI / 2, 0, Math.atan2(4, w)]}
        material={plaster}
        receiveShadow
      >
        <planeGeometry args={[w, h]} />
      </mesh>
    </group>
  )
}

export default PoolWalls
