'use client'

import { Html } from '@react-three/drei'
import type { Vec3 } from '@/modules/editor/state/editorStore'

interface Props {
  a: Vec3
  b: Vec3
}

// Drei's <Html> is a DOM portal anchored to a 3D position. Mounted from
// inside <Canvas> by ToolGestures so it travels with the camera. Esc-dismiss
// is handled in ToolGestures (clears measureA/measureB).
export function MeasureLabelOverlay({ a, b }: Props) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const distFt = Math.hypot(dx, dy, dz)
  const total = Math.round(distFt * 12)
  const ft = Math.floor(total / 12)
  const inch = total % 12
  const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.5, (a[2] + b[2]) / 2]
  return (
    <Html position={mid} center distanceFactor={20} zIndexRange={[1, 0]}>
      <div className="pointer-events-none rounded-md bg-pfText px-2 py-1 font-mono text-[11px] tabular-nums text-white shadow-pfMd">
        {ft}&apos; {inch}&quot;
      </div>
    </Html>
  )
}
