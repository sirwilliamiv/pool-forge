'use client'

import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import { INK, TINTS } from '@/lib/brand'
import { gridInches } from '@/lib/geometry/drawing'
import { gridCentre, gridLayout } from '@/modules/editor/grid-layout'
import { useDrawStore } from '@/modules/editor/state/drawStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'

/**
 * The ground, and the grid drawn on it.
 *
 * One span for both grids and integer divisions by construction, so a drawn
 * square is exactly the size things snap to and a heavy line always falls on a
 * fine one. See `grid-layout.ts` for what went wrong when they were computed
 * separately.
 */
export function Ground() {
  const gridVisible = useEditorStore(s => s.gridVisible)
  const spacing = useDrawStore(s => s.gridSpacing)
  const cellFt = gridInches(spacing) / 12

  const layout = useMemo(() => gridLayout(cellFt), [cellFt])

  // The grid follows where the camera is looking, snapped to whole major cells
  // so its lines stay put in world space instead of crawling.
  const camera = useThree(state => state.camera)
  const fine = useRef<THREE.GridHelper>(null)
  const major = useRef<THREE.GridHelper>(null)
  useFrame(() => {
    if (!gridVisible) return
    // Where the camera is over the ground, which for both the orbit and the
    // orthographic views is simply its x and z.
    const centre = gridCentre({ x: camera.position.x, z: camera.position.z }, cellFt)
    if (fine.current) fine.current.position.set(centre.x, 0.01, centre.z)
    if (major.current) major.current.position.set(centre.x, 0.012, centre.z)
  })

  return (
    <>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -2, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={INK.paper} roughness={0.95} />
      </mesh>
      {gridVisible ? (
        <>
          <gridHelper
            ref={fine}
            args={[layout.spanFt, layout.divisions, TINTS.slateMist, TINTS.slateMist]}
            position={[0, 0.01, 0]}
          />
          {/* Same span, a factor of the same divisions, so these lines land on
              fine ones rather than beside them. */}
          <gridHelper
            ref={major}
            args={[layout.spanFt, layout.majorDivisions, INK.slate, INK.slate]}
            position={[0, 0.012, 0]}
          />
        </>
      ) : null}
    </>
  )
}
