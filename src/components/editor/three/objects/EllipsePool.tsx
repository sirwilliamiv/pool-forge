'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { getMaterial, waterDefault } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

// Oval pool for RECTANGLE_POOL shapes flagged displayHint.poolShape='ellipse'.
// A compact massing render (elliptical basin + water disc) rather than the
// four-wall rectangular build in PoolWalls.
export function EllipsePool({ shape, materialId }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)
  const wallH = 5
  const plaster = getMaterial(materialId ?? 'pebbletecBlueGranite')

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      {/* Elliptical basin: a unit cylinder scaled to the bounding ellipse. */}
      <mesh
        position={[0, -wallH / 2, 0]}
        scale={[w / 2, 1, h / 2]}
        material={plaster}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 1, wallH, 64]} />
      </mesh>
      {/* Water surface. */}
      <mesh
        position={[0, -0.32, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w * 0.49, h * 0.49, 1]}
        material={waterDefault}
        receiveShadow
      >
        <circleGeometry args={[1, 64]} />
      </mesh>
    </group>
  )
}

export default EllipsePool
