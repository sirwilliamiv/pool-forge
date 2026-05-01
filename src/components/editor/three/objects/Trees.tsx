'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { treeBark, treeFoliage, treeFoliageAlt } from '../Materials'

interface TreeSpec {
  x: number
  z: number
  scale?: number
}

interface Props {
  shape?: Shape
  position?: [number, number, number]
  trees?: TreeSpec[]
  materialId?: string
}

interface TreeProps {
  spec: TreeSpec
  trunk: THREE.Material
  leaves: THREE.Material
  leavesAlt: THREE.Material
}

function Tree({ spec, trunk, leaves, leavesAlt }: TreeProps) {
  const s = spec.scale ?? 1
  return (
    <group position={[spec.x, 0, spec.z]}>
      <mesh position={[0, 1.5 * s, 0]} material={trunk} castShadow>
        <cylinderGeometry args={[0.3 * s, 0.4 * s, 3 * s, 12]} />
      </mesh>
      <mesh position={[0, 4.2 * s, 0]} material={leaves} castShadow>
        <sphereGeometry args={[2.2 * s, 16, 16]} />
      </mesh>
      <mesh position={[1.2 * s, 4.6 * s, 0.4 * s]} material={leavesAlt} castShadow>
        <sphereGeometry args={[1.6 * s, 16, 16]} />
      </mesh>
    </group>
  )
}

export function Trees({
  shape,
  position = [0, 0, 0],
  trees = [
    { x: -26, z: 8, scale: 1.0 },
    { x: 28, z: -14, scale: 1.2 },
    { x: -30, z: -16, scale: 0.9 },
  ],
}: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current && shape) ref.current.userData.id = shape.id
  }, [shape])

  const trunk = treeBark
  const leaves = treeFoliage
  const leavesAlt = treeFoliageAlt

  const rootPosition: [number, number, number] = shape
    ? [feet(shape.x), 0, feet(shape.y)]
    : position

  return (
    <group ref={ref} position={rootPosition}>
      {trees.map((spec, i) => (
        <Tree key={i} spec={spec} trunk={trunk} leaves={leaves} leavesAlt={leavesAlt} />
      ))}
    </group>
  )
}

export default Trees
