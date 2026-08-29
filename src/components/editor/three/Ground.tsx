'use client'

import { useMemo } from 'react'

import { gridInches } from '@/lib/geometry/drawing'
import { useDrawStore } from '@/modules/editor/state/drawStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'

/**
 * Keep the number of drawn lines sane at every grid size.
 *
 * A three-inch grid across the whole 400 ft ground plane is sixteen hundred
 * divisions each way, which costs a lot to draw and reads as solid grey anyway.
 * The span shrinks as the cells do, so a fine grid covers the area somebody is
 * actually detailing rather than the whole county.
 */
const MAX_DIVISIONS = 240

function gridFor(cellFt: number): { spanFt: number; divisions: number } {
  const spanFt = Math.min(400, Math.max(40, cellFt * MAX_DIVISIONS))
  return { spanFt, divisions: Math.round(spanFt / cellFt) }
}

export function Ground() {
  const gridVisible = useEditorStore(s => s.gridVisible)
  const spacing = useDrawStore(s => s.gridSpacing)
  const cellFt = gridInches(spacing) / 12

  const { fine, major } = useMemo(() => {
    const f = gridFor(cellFt)
    // A heavier line every ten cells, which is what makes a grid countable
    // rather than a texture: at a one-foot grid that is a line every ten feet.
    const majorCell = cellFt * 10
    return { fine: f, major: gridFor(majorCell) }
  }, [cellFt])

  return (
    <>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -2, 0]}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#EEF2F4" roughness={0.95} />
      </mesh>
      {gridVisible ? (
        <>
          <gridHelper
            args={[fine.spanFt, fine.divisions, '#dbe3e9', '#e6ebf0']}
            position={[0, 0.01, 0]}
          />
          <gridHelper
            args={[major.spanFt, major.divisions, '#9fb2bf', '#b9c7d1']}
            position={[0, 0.012, 0]}
          />
        </>
      ) : null}
    </>
  )
}
