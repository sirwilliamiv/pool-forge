'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { normalizePolygon } from '@/lib/geometry/polygon-footprint'
import { isPolygonPool, type Shape } from '@/modules/editor/state/shapes'
import { getMaterial, waterDefault } from '../Materials'

interface Props {
  shape: Shape
  materialId?: string
}

const WALL_HEIGHT_FT = 5
const WATER_DROP_FT = 0.32

// Footprint ring as a THREE.Shape in scene feet. Null below three points: an
// empty or degenerate ring has nothing to extrude.
function buildContour(outline: readonly { x: number; y: number }[]): THREE.Shape | null {
  const first = outline[0]
  if (outline.length < 3 || !first) return null
  const contour = new THREE.Shape()
  contour.moveTo(feet(first.x), feet(first.y))
  for (let i = 1; i < outline.length; i++) {
    const p = outline[i]
    if (!p) continue
    contour.lineTo(feet(p.x), feet(p.y))
  }
  contour.closePath()
  return contour
}

// Freeform pool: the basin is the footprint ring extruded downward, so the
// render matches what the measurement engine measures. Points are inches
// relative to the shape origin; the group is placed at that origin.
export function PolygonPool({ shape, materialId }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const outline = useMemo(
    () => normalizePolygon(isPolygonPool(shape) ? shape.points : []),
    [shape],
  )

  const contour = useMemo(() => buildContour(outline), [outline])

  const geometry = useMemo(
    () =>
      contour
        ? new THREE.ExtrudeGeometry(contour, {
            depth: WALL_HEIGHT_FT,
            bevelEnabled: false,
            curveSegments: 1,
          })
        : null,
    [contour],
  )

  const waterGeometry = useMemo(
    () => (contour ? new THREE.ShapeGeometry(contour) : null),
    [contour],
  )

  useEffect(() => {
    return () => {
      geometry?.dispose()
      waterGeometry?.dispose()
    }
  }, [geometry, waterGeometry])

  if (!geometry || !waterGeometry) return null

  const plaster = getMaterial(materialId ?? 'pebbletecBlueGranite')

  return (
    <group
      ref={ref}
      position={[feet(shape.x), 0, feet(shape.y)]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      {/* Extrusion is built in the XY plane, so lay it flat and push it down. */}
      <mesh
        geometry={geometry}
        material={plaster}
        position={[0, -WALL_HEIGHT_FT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={waterGeometry}
        material={waterDefault}
        position={[0, -WATER_DROP_FT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      />
    </group>
  )
}

export default PolygonPool
