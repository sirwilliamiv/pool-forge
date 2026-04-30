'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'

interface Props {
  shape: Shape
}

const FALLBACK_COLOR = '#94A3B8'

function colorFor(shape: Shape): string {
  if (shape.kind !== ShapeKind.STENCIL) return FALLBACK_COLOR
  const stencil = getStencil(shape.stencilId)
  return stencil?.defaultFill ?? FALLBACK_COLOR
}

export function GenericStencil({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = Math.max(0.5, feet(shape.width))
  const h = Math.max(0.5, feet(shape.height))
  const color = colorFor(shape)

  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 }),
    [color],
  )

  return (
    <group
      ref={ref}
      position={[feet(shape.x + shape.width / 2), 0.25, feet(shape.y + shape.height / 2)]}
      rotation={[0, -((shape.rotation ?? 0) * Math.PI) / 180, 0]}
    >
      <mesh material={material} castShadow receiveShadow>
        <boxGeometry args={[w, 0.5, h]} />
      </mesh>
      <mesh position={[0, 0.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
