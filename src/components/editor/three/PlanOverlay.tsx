'use client'

import { Html } from '@react-three/drei'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { ShapeKind } from '@/modules/editor/state/shapes'
import { feet } from '@/lib/three/units'

const SETBACK_FT = 7.5
const Y = 0.05

function dimensionLabel(value: string) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid #0E9DE5',
        borderRadius: 4,
        color: '#0F172A',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 6px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {value}
    </div>
  )
}

function formatFeet(ft: number): string {
  const whole = Math.floor(ft)
  const inches = Math.round((ft - whole) * 12)
  if (inches === 0) return `${whole}'`
  return `${whole}' ${inches}"`
}

function SetbackEnvelope() {
  const w = 60
  const h = 50
  const t = 0.15
  const colorProps = { color: '#F59E0B', transparent: true, opacity: 0.9 }
  return (
    <group position={[0, Y, 0]}>
      <mesh position={[0, 0, -h / 2]}>
        <boxGeometry args={[w, 0.05, t]} />
        <meshBasicMaterial {...colorProps} />
      </mesh>
      <mesh position={[0, 0, h / 2]}>
        <boxGeometry args={[w, 0.05, t]} />
        <meshBasicMaterial {...colorProps} />
      </mesh>
      <mesh position={[w / 2, 0, 0]}>
        <boxGeometry args={[t, 0.05, h]} />
        <meshBasicMaterial {...colorProps} />
      </mesh>
      <mesh position={[-w / 2, 0, 0]}>
        <boxGeometry args={[t, 0.05, h]} />
        <meshBasicMaterial {...colorProps} />
      </mesh>
      <Html position={[0, 0, -h / 2 - 1.5]} center>
        <div
          style={{
            background: 'rgba(245,158,11,0.9)',
            color: 'white',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            padding: '2px 6px',
            borderRadius: 3,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}
        >
          Setback {SETBACK_FT}&apos;
        </div>
      </Html>
    </group>
  )
}

export function PlanOverlay() {
  const shapes = useShapesStore((s) => s.shapes)

  return (
    <group name="plan-overlay">
      <SetbackEnvelope />
      {shapes.map((shape) => {
        if (shape.kind !== ShapeKind.RECTANGLE_POOL) return null
        const w = feet(shape.width)
        const h = feet(shape.height)
        const cx = feet(shape.x) + w / 2
        const cz = feet(shape.y) + h / 2
        return (
          <group key={shape.id}>
            <Html position={[cx, Y, cz - h / 2 - 1.2]} center>
              {dimensionLabel(formatFeet(w))}
            </Html>
            <Html position={[cx + w / 2 + 1.2, Y, cz]} center>
              {dimensionLabel(formatFeet(h))}
            </Html>
          </group>
        )
      })}
    </group>
  )
}
