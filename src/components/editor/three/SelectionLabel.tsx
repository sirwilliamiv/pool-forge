'use client'

import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { useScreenSelectionStore } from '@/modules/editor/state/screenSelectionStore'

const _bbox = new THREE.Box3()
const _top = new THREE.Vector3()

function findObjectById(scene: THREE.Object3D, id: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null
  scene.traverse((obj) => {
    if (!found && obj.userData && obj.userData.id === id) found = obj
  })
  return found
}

export function SelectionLabel() {
  const { scene, camera, gl } = useThree()
  const setPosition = useScreenSelectionStore((s) => s.setPosition)
  const setVisible = useScreenSelectionStore((s) => s.setVisible)

  useFrame(() => {
    const ids = useSelectionStore.getState().selectedIds
    const id = ids[0]
    if (!id) {
      setVisible(false)
      return
    }
    const obj = findObjectById(scene, id)
    if (!obj) {
      setVisible(false)
      return
    }
    _bbox.setFromObject(obj)
    if (_bbox.isEmpty()) {
      setVisible(false)
      return
    }
    const center = _bbox.getCenter(new THREE.Vector3())
    _top.set(center.x, _bbox.max.y, center.z)
    _top.project(camera)
    if (_top.z > 1 || _top.z < -1) {
      setVisible(false)
      return
    }
    const rect = gl.domElement.getBoundingClientRect()
    const x = (_top.x * 0.5 + 0.5) * rect.width
    const y = (_top.y * -0.5 + 0.5) * rect.height
    setPosition(x, y)
    setVisible(true)
  })

  return null
}
