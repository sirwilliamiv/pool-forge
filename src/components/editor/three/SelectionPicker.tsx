'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { dispatchEphemeral } from '@/lib/commands/dispatch'
import { pickShapeId } from '@/lib/three/pick'

export function SelectionPicker() {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()

    let downX = 0
    let downY = 0

    function onPointerDown(e: PointerEvent) {
      downX = e.clientX
      downY = e.clientY
    }

    function onPointerUp(e: PointerEvent) {
      // Treat as click only if pointer didn't drag.
      if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return

      const id = pickShapeId(raycaster, camera, scene, dom, e.clientX, e.clientY)
      if (id) {
        dispatchEphemeral('selection.set', { ids: [id] })
        return
      }
      // Click missed every selectable — clear.
      dispatchEphemeral('selection.set', { ids: [] })
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        dispatchEphemeral('selection.set', { ids: [] })
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
