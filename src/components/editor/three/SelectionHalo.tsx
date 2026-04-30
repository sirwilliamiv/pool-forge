'use client'

import { useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'

const HALO_COLOR = 0x0e9de5
const PADDING = 0.3

function findObjectById(scene: THREE.Object3D, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  scene.traverse((obj) => {
    if (!found && obj.userData && obj.userData.id === id) found = obj
  })
  return found
}

function HaloFor({ id }: { id: string }) {
  const { scene } = useThree()
  // Re-key on shape geometry mutations so the halo recomputes on resize/move.
  const shape = useShapesStore((s) => s.shapes.find((sh) => sh.id === id))

  const geo = useMemo(() => {
    const obj = findObjectById(scene, id)
    if (!obj) return null
    const bbox = new THREE.Box3().setFromObject(obj)
    if (bbox.isEmpty()) return null
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    bbox.getSize(size)
    bbox.getCenter(center)
    const box = new THREE.BoxGeometry(size.x + PADDING, size.y + PADDING, size.z + PADDING)
    const edges = new THREE.EdgesGeometry(box)
    box.dispose()
    return { edges, center }
    // shape is a dependency so geometry mutations re-run; eslint may flag scene
    // but useThree returns a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, scene, shape?.x, shape?.y, shape?.width, shape?.height, shape?.rotation])

  if (!geo) return null
  return (
    <lineSegments position={geo.center.toArray()} renderOrder={999}>
      <primitive object={geo.edges} attach="geometry" />
      <lineBasicMaterial color={HALO_COLOR} depthTest={false} transparent />
    </lineSegments>
  )
}

export function SelectionHalo() {
  const selectedIds = useSelectionStore((s) => s.selectedIds)
  const flags = usePresentationFlags()
  if (!flags.showSelectionChrome) return null
  return (
    <>
      {selectedIds.map((id) => (
        <HaloFor key={id} id={id} />
      ))}
    </>
  )
}
