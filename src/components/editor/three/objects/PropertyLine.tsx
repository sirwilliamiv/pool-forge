'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { readLimits } from '@/modules/editor/site/model'
import type { Shape } from '@/modules/editor/state/shapes'

// The lot line, on the ground where you can see it.
//
// It is drawn rather than filled: a property line is a boundary, and a solid
// slab the size of the lot would bury the design. The dashed inner rectangle is
// the setback envelope, and it only appears once somebody has entered what this
// jurisdiction requires — an envelope drawn from a default would be a line a
// crew could dig to.

const LINE_Y = 0.03
const ENVELOPE_Y = 0.04
const LINE_WIDTH = 0.5
const DASH_LENGTH = 2
const DASH_GAP = 1.4

interface Props {
  shape: Shape
}

function Edges({
  x,
  z,
  width,
  depth,
  y,
  color,
  thickness,
}: {
  x: number
  z: number
  width: number
  depth: number
  y: number
  color: string
  thickness: number
}) {
  const bars: Array<{ key: string; position: [number, number, number]; size: [number, number] }> = [
    { key: 'n', position: [x + width / 2, y, z], size: [width, thickness] },
    { key: 's', position: [x + width / 2, y, z + depth], size: [width, thickness] },
    { key: 'w', position: [x, y, z + depth / 2], size: [thickness, depth] },
    { key: 'e', position: [x + width, y, z + depth / 2], size: [thickness, depth] },
  ]
  return (
    <group>
      {bars.map(bar => (
        <mesh key={bar.key} position={bar.position} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[bar.size[0], bar.size[1]]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  )
}

/** A dashed run, because a setback line is drawn dashed on every sheet ever. */
function DashedRun({
  from,
  to,
  y,
  color,
}: {
  from: [number, number]
  to: [number, number]
  y: number
  color: string
}) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const step = DASH_LENGTH + DASH_GAP
  const count = Math.max(1, Math.floor(length / step))
  const dashes: number[] = []
  for (let i = 0; i < count; i++) dashes.push(i * step + DASH_LENGTH / 2)
  return (
    <group position={[from[0], y, from[1]]} rotation={[0, -angle, 0]}>
      {dashes.map(offset => (
        <mesh key={offset} position={[offset, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[DASH_LENGTH, 0.35]} />
          <meshBasicMaterial color={color} />
        </mesh>
      ))}
    </group>
  )
}

export function PropertyLine({ shape }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const x = feet(shape.x)
  const z = feet(shape.y)
  const width = feet(shape.width)
  const depth = feet(shape.height)
  const limits = readLimits(shape)

  const front = limits.frontFt ?? null
  const rear = limits.rearFt ?? null
  const side = limits.sideFt ?? null

  return (
    <group ref={ref}>
      <Edges x={x} z={z} width={width} depth={depth} y={LINE_Y} color="#1F2937" thickness={LINE_WIDTH} />
      {front !== null ? (
        <DashedRun from={[x, z + front]} to={[x + width, z + front]} y={ENVELOPE_Y} color="#9CA3AF" />
      ) : null}
      {rear !== null ? (
        <DashedRun
          from={[x, z + depth - rear]}
          to={[x + width, z + depth - rear]}
          y={ENVELOPE_Y}
          color="#9CA3AF"
        />
      ) : null}
      {side !== null ? (
        <>
          <DashedRun from={[x + side, z]} to={[x + side, z + depth]} y={ENVELOPE_Y} color="#9CA3AF" />
          <DashedRun
            from={[x + width - side, z]}
            to={[x + width - side, z + depth]}
            y={ENVELOPE_Y}
            color="#9CA3AF"
          />
        </>
      ) : null}
    </group>
  )
}

export default PropertyLine
