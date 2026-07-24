'use client'

import { useEditorStore } from '@/modules/editor/state/editorStore'

export function Ground() {
  const gridVisible = useEditorStore((s) => s.gridVisible)
  return (
    <>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -2, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#EEF2F4" roughness={0.95} />
      </mesh>
      {gridVisible ? (
        // 80 ft span, 1 ft cells, just above the shape base plane so it reads as
        // an alignment grid in plan and 3D views.
        <gridHelper args={[80, 80, '#c7d2da', '#e6ebf0']} position={[0, 0.01, 0]} />
      ) : null}
    </>
  )
}
