'use client'

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'
import { toast } from 'sonner'
import { dispatch } from '@/lib/commands/dispatch'
import { groundPoint } from '@/lib/three/ground'
import { NO_GROUND, planDrop } from '@/modules/editor/interactions/canvas-drop'
import { decodeStencilDrag, hasStencilDrag } from '@/modules/editor/interactions/stencil-drag'
import { VisioMessage } from '@/modules/imports/visio/types'

/**
 * Catches a stencil card dropped on the canvas and places it, centred under
 * the pointer, through the same commands a click uses.
 *
 * Native listeners on the WebGL element, like the drawing tools, so the drop
 * and a click agree about where the ground is. A file dragged from the desktop
 * is not ours and is left alone: the Stencils panel imports files, and the
 * document-level swallow in `useFileDrop` keeps a near miss from navigating.
 */
export function CanvasDropTarget() {
  const { gl, camera } = useThree()

  useEffect(() => {
    const el = gl.domElement
    const raycaster = new THREE.Raycaster()

    function onDragOver(e: DragEvent) {
      if (!hasStencilDrag(e.dataTransfer?.types)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }

    function onDrop(e: DragEvent) {
      const payload = decodeStencilDrag(e.dataTransfer)
      if (!payload) return
      e.preventDefault()
      const hit = groundPoint(e, el, camera, raycaster)
      const plan = planDrop(payload, hit ? { x: hit.x, z: hit.z } : null)
      if (plan === null) return
      if (plan === NO_GROUND) {
        toast(VisioMessage.NO_GROUND)
        return
      }
      void dispatch(plan.command, plan.input).then((result) => {
        if (!result.ok) toast.error(result.error)
      })
    }

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('drop', onDrop)
    }
  }, [gl, camera])

  return null
}
