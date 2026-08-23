'use client'

import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { dispatchEphemeral } from '@/lib/commands/dispatch'
import { pickShapeId } from '@/lib/three/pick'
import { isClick, type ScreenPoint } from '@/modules/editor/interactions/pointer'

export function SelectionPicker() {
  const { gl, camera, scene } = useThree()

  useEffect(() => {
    const dom = gl.domElement
    const raycaster = new THREE.Raycaster()

    // Null until a primary-button press lands on the canvas. A release with no
    // matching press is not a click: DragHandler swallows the pointerdown when
    // a drag starts, and a press that began on an overlay panel never reaches
    // here at all. Comparing those releases against a stale press used to clear
    // the selection out from under the user.
    let down: ScreenPoint | null = null

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      down = { x: e.clientX, y: e.clientY }
    }

    function onPointerUp(e: PointerEvent) {
      // Right-click opens no menu here, but it must not change the selection.
      if (e.button !== 0) return
      const press = down
      down = null
      // Treat as click only if pointer didn't drag.
      if (!isClick(press, { x: e.clientX, y: e.clientY })) return

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
