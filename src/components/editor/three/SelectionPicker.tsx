'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { dispatch } from '@/lib/commands/dispatch'

export function SelectionPicker() {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    let downX = 0
    let downY = 0

    function onPointerDown(e: PointerEvent) {
      downX = e.clientX
      downY = e.clientY
    }

    function onPointerUp(e: PointerEvent) {
      // Treat as click only if pointer didn't drag.
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return

      const rect = dom.getBoundingClientRect()
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObjects(scene.children, true)
      for (const hit of intersects) {
        let obj: THREE.Object3D | null = hit.object
        while (obj && !(obj.userData && obj.userData.id) && obj.parent) {
          obj = obj.parent
        }
        if (obj && obj.userData && obj.userData.id) {
          void dispatch('selection.set', { ids: [obj.userData.id as string] })
          return
        }
      }
      // Click missed every selectable — clear.
      void dispatch('selection.set', { ids: [] })
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        void dispatch('selection.set', { ids: [] })
      }
    }

    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointerup', onPointerUp)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [gl, camera, scene])

  return null
}
