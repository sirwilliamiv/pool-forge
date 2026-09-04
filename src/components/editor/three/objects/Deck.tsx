'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import type { Shape } from '@/modules/editor/state/shapes'
import { concreteDeck } from '../Materials'

interface Cutout {
  kind: 'rect' | 'circle'
  x: number
  z: number
  width?: number
  height?: number
  radius?: number
}

interface Props {
  shape: Shape
  materialId?: string
  cutouts?: Cutout[]
}

export function Deck({ shape, cutouts = [] }: Props) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (ref.current) ref.current.userData.id = shape.id
  }, [shape.id])

  const w = feet(shape.width)
  const h = feet(shape.height)

  const deckMat = concreteDeck

  // `cutouts` arrives as a fresh array every render (SceneRoot rebuilds it), so
  // memoising on the array reference rebuilt the extrude geometry (the most
  // expensive in the scene) on every render even when no hole moved. Key the
  // memo on the serialized holes instead, so it rebuilds only when a cutout
  // actually changes.
  const cutoutSignature = useMemo(
    () =>
      cutouts
        .map(c => `${c.kind}:${c.x}:${c.z}:${c.width ?? ''}:${c.height ?? ''}:${c.radius ?? ''}`)
        .join('|'),
    [cutouts],
  )

  const geometry = useMemo(() => {
    const outer = new THREE.Shape()
    outer.moveTo(-w / 2, -h / 2)
    outer.lineTo(w / 2, -h / 2)
    outer.lineTo(w / 2, h / 2)
    outer.lineTo(-w / 2, h / 2)
    outer.lineTo(-w / 2, -h / 2)

    for (const c of cutouts) {
      const path = new THREE.Path()
      if (c.kind === 'rect' && c.width != null && c.height != null) {
        const cw = c.width / 2
        const ch = c.height / 2
        path.moveTo(c.x - cw, c.z - ch)
        path.lineTo(c.x + cw, c.z - ch)
        path.lineTo(c.x + cw, c.z + ch)
        path.lineTo(c.x - cw, c.z + ch)
        path.lineTo(c.x - cw, c.z - ch)
      } else if (c.kind === 'circle' && c.radius != null) {
        path.absarc(c.x, c.z, c.radius, 0, Math.PI * 2, false)
      }
      outer.holes.push(path)
    }

    const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.5, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)
    return geo
    // cutoutSignature stands in for the `cutouts` array (a fresh reference every
    // render) so the geometry rebuilds on a real hole change, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, cutoutSignature])

  // The group no longer remounts on a size/cutout change, so R3F won't dispose
  // the previous geometry for us. Dispose it when it is replaced (and on
  // unmount) to keep the extrude meshes from leaking on the GPU.
  useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])

  return (
    <group
      ref={ref}
      position={[feet(shape.x) + w / 2, 0, feet(shape.y) + h / 2]}
      rotation={[0, (shape.rotation * Math.PI) / 180, 0]}
    >
      <mesh geometry={geometry} material={deckMat} castShadow receiveShadow />
    </group>
  )
}

export default Deck
