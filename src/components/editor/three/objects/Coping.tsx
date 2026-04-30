'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { travertineSilver } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

export function Coping({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)
  const inset = 0.7 // outer skirt width

  const copingMat = travertineSilver

  const geometry = useMemo(() => {
    const outer = new THREE.Shape()
    outer.moveTo(-w / 2 - inset, -h / 2 - inset)
    outer.lineTo(w / 2 + inset, -h / 2 - inset)
    outer.lineTo(w / 2 + inset, h / 2 + inset)
    outer.lineTo(-w / 2 - inset, h / 2 + inset)
    outer.lineTo(-w / 2 - inset, -h / 2 - inset)

    const hole = new THREE.Path()
    hole.moveTo(-w / 2, -h / 2)
    hole.lineTo(w / 2, -h / 2)
    hole.lineTo(w / 2, h / 2)
    hole.lineTo(-w / 2, h / 2)
    hole.lineTo(-w / 2, -h / 2)
    outer.holes.push(hole)

    const geo = new THREE.ExtrudeGeometry(outer, {
      depth: 0.6,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.04,
      bevelThickness: 0.06,
    })
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [w, h])

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0.05, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh geometry={geometry} material={copingMat} castShadow receiveShadow />
    </group>
  )
}

export default Coping
