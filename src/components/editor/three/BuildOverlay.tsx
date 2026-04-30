'use client'

import { Html } from '@react-three/drei'
import { useMemo } from 'react'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { ShapeKind } from '@/modules/editor/state/shapes'
import { feet } from '@/lib/three/units'

const REBAR_SPACING_FT = 1.5
const FLOOR_Y = 0.04

function annotation(value: string, color: string) {
  return (
    <div
      style={{
        background: 'rgba(15,23,42,0.85)',
        border: `1px solid ${color}`,
        color: 'white',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: '2px 6px',
        borderRadius: 3,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        textTransform: 'uppercase',
      }}
    >
      {value}
    </div>
  )
}

function RebarGrid({
  cx,
  cz,
  width,
  height,
}: {
  cx: number
  cz: number
  width: number
  height: number
}) {
  const dots = useMemo(() => {
    const pts: Array<[number, number]> = []
    const cols = Math.max(1, Math.floor(width / REBAR_SPACING_FT) - 1)
    const rows = Math.max(1, Math.floor(height / REBAR_SPACING_FT) - 1)
    const startX = cx - width / 2 + (width - cols * REBAR_SPACING_FT) / 2
    const startZ = cz - height / 2 + (height - rows * REBAR_SPACING_FT) / 2
    for (let i = 0; i <= cols; i++) {
      for (let j = 0; j <= rows; j++) {
        pts.push([startX + i * REBAR_SPACING_FT, startZ + j * REBAR_SPACING_FT])
      }
    }
    return pts
  }, [cx, cz, width, height])

  return (
    <group>
      {dots.map(([x, z], idx) => (
        <mesh key={idx} position={[x, FLOOR_Y, z]}>
          <sphereGeometry args={[0.08, 6, 6]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
      ))}
    </group>
  )
}

function GasLine({
  fromX,
  fromZ,
  toX,
  toZ,
}: {
  fromX: number
  fromZ: number
  toX: number
  toZ: number
}) {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const cx = (fromX + toX) / 2
  const cz = (fromZ + toZ) / 2
  return (
    <group>
      <mesh position={[cx, FLOOR_Y, cz]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[length, 0.08, 0.18]} />
        <meshBasicMaterial color="#FACC15" />
      </mesh>
      <Html position={[cx, FLOOR_Y + 0.6, cz]} center>
        {annotation('Gas line · 3/4"', '#FACC15')}
      </Html>
    </group>
  )
}

export function BuildOverlay() {
  const shapes = useShapesStore((s) => s.shapes)
  const pool = shapes.find((s) => s.kind === ShapeKind.RECTANGLE_POOL)

  if (!pool) return null

  const w = feet(pool.width)
  const h = feet(pool.height)
  const cx = feet(pool.x) + w / 2
  const cz = feet(pool.y) + h / 2

  const padX = 24
  const padZ = -22

  return (
    <group name="build-overlay">
      <RebarGrid cx={cx} cz={cz} width={w} height={h} />
      <GasLine fromX={cx + w / 2} fromZ={cz} toX={padX} toZ={padZ} />
      <Html position={[cx, FLOOR_Y + 0.8, cz]} center>
        {annotation('#3 Rebar · 18" OC', '#EF4444')}
      </Html>
      <Html position={[padX, FLOOR_Y + 1.6, padZ]} center>
        {annotation('Equipment pad · 110V/220V', '#FACC15')}
      </Html>
    </group>
  )
}
