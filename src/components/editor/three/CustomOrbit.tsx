'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import {
  ISO_DEFAULT,
  TRANSITION_MS,
  VIEW_POSES,
  WHEEL_PAN_FACTOR,
  lerpSpherical,
  orthoPanSpeed,
  perspectivePanSpeed,
  poseToSpherical,
  resolveDragMode,
  rotateSpherical,
  sphericalToPosition,
  transitionEase,
  zoomDistance,
  zoomOrthoLevel,
  type SphericalState,
} from '@/modules/editor/interactions/orbit'

function applyToCamera(
  camera: THREE.Camera,
  sph: SphericalState,
  target: THREE.Vector3,
) {
  const [x, y, z] = sphericalToPosition(sph, [target.x, target.y, target.z])
  camera.position.set(x, y, z)
  camera.lookAt(target)
  camera.updateMatrixWorld()
}

interface Transition {
  startTime: number
  startSph: SphericalState
  endSph: SphericalState
  startTarget: THREE.Vector3
  endTarget: THREE.Vector3
}

export function CustomOrbit() {
  const camera = useThree((s) => s.camera)
  const domElement = useThree((s) => s.gl.domElement)
  const transitionToken = useCameraStore((s) => s.transitionToken)
  const targetView = useCameraStore((s) => s.targetView)
  const framePose = useCameraStore((s) => s.framePose)
  const frameTarget = useCameraStore((s) => s.frameTarget)

  const sphRef = useRef<SphericalState>({ ...ISO_DEFAULT })
  const targetRef = useRef(new THREE.Vector3(0, -1, 0))
  const transitionRef = useRef<Transition | null>(null)

  // Apply initial pose once when camera mounts (or swaps).
  // Skip for orthographic cameras — CameraRig sets their pose explicitly,
  // and overriding it would clobber the top-down (plan) / side-on (section) view.
  useEffect(() => {
    if (camera instanceof THREE.OrthographicCamera) return
    applyToCamera(camera, sphRef.current, targetRef.current)
  }, [camera])

  // Trigger transition when the view-cube store ticks transitionToken.
  useEffect(() => {
    if (targetView) {
      const pose = VIEW_POSES[targetView]
      if (!pose) return
      transitionRef.current = {
        startTime: performance.now(),
        startSph: { ...sphRef.current },
        endSph: { ...pose.spherical },
        startTarget: targetRef.current.clone(),
        endTarget: new THREE.Vector3(...pose.target),
      }
      return
    }
    if (framePose && frameTarget) {
      // Convert cartesian framePose (relative to frameTarget) into spherical.
      transitionRef.current = {
        startTime: performance.now(),
        startSph: { ...sphRef.current },
        endSph: poseToSpherical(framePose, frameTarget),
        startTarget: targetRef.current.clone(),
        endTarget: new THREE.Vector3(...frameTarget),
      }
    }
  }, [transitionToken, targetView, framePose, frameTarget])

  // Pointer-driven orbit + pan + zoom on the canvas DOM element.
  useEffect(() => {
    let dragging: 'rotate' | 'pan' | null = null
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      // Orthographic views (plan / section) never rotate: any drag is a pan.
      const mode = resolveDragMode(e, camera instanceof THREE.OrthographicCamera)
      if (!mode) return
      dragging = mode
      transitionRef.current = null
      lastX = e.clientX
      lastY = e.clientY
      try {
        domElement.setPointerCapture(e.pointerId)
      } catch {
        /* not all environments support pointer capture */
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      if (dragging === 'rotate') {
        sphRef.current = rotateSpherical(sphRef.current, dx, dy)
        applyToCamera(camera, sphRef.current, targetRef.current)
      } else if (camera instanceof THREE.OrthographicCamera) {
        // Plan / section: pan the camera + target together along world axes
        // that align with the screen. Speed scales inversely with zoom so the
        // drag tracks the cursor regardless of zoom level.
        const speed = orthoPanSpeed(camera.zoom)
        // Plan view looks down +Y → screen-right is +X, screen-up is +Z.
        // Section view looks along +X → screen-right is +Z, screen-up is +Y.
        const lookDir = new THREE.Vector3()
        camera.getWorldDirection(lookDir)
        const right = new THREE.Vector3().crossVectors(lookDir, camera.up).normalize()
        const up = new THREE.Vector3().crossVectors(right, lookDir).normalize()
        camera.position.addScaledVector(right, -dx * speed)
        camera.position.addScaledVector(up, dy * speed)
        targetRef.current.addScaledVector(right, -dx * speed)
        targetRef.current.addScaledVector(up, dy * speed)
        camera.updateMatrixWorld()
      } else {
        // 3D: pan target along ground plane in camera-relative axes.
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        forward.y = 0
        forward.normalize()
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
        const panSpeed = perspectivePanSpeed(sphRef.current.distance)
        targetRef.current.addScaledVector(right, -dx * panSpeed)
        targetRef.current.addScaledVector(forward, dy * panSpeed)
        applyToCamera(camera, sphRef.current, targetRef.current)
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      dragging = null
      try {
        domElement.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()

      // Modifier keys → pan instead of zoom (Visio parity).
      // Ctrl/⌘ + wheel → vertical pan. Shift + wheel → horizontal pan.
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        const horizontal = e.shiftKey && !e.ctrlKey && !e.metaKey
        if (camera instanceof THREE.OrthographicCamera) {
          const lookDir = new THREE.Vector3()
          camera.getWorldDirection(lookDir)
          const right = new THREE.Vector3().crossVectors(lookDir, camera.up).normalize()
          const up = new THREE.Vector3().crossVectors(right, lookDir).normalize()
          const axis = horizontal ? right : up
          const sign = horizontal ? 1 : -1
          const delta = sign * e.deltaY * WHEEL_PAN_FACTOR * orthoPanSpeed(camera.zoom) * 20
          camera.position.addScaledVector(axis, delta)
          targetRef.current.addScaledVector(axis, delta)
          camera.updateMatrixWorld()
        } else {
          const forward = new THREE.Vector3()
          camera.getWorldDirection(forward)
          forward.y = 0
          forward.normalize()
          const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
          const axis = horizontal ? right : forward
          const delta = e.deltaY * WHEEL_PAN_FACTOR * sphRef.current.distance * 0.02
          targetRef.current.addScaledVector(axis, delta)
          applyToCamera(camera, sphRef.current, targetRef.current)
        }
        return
      }

      // Plain wheel → zoom.
      if (camera instanceof THREE.OrthographicCamera) {
        camera.zoom = zoomOrthoLevel(camera.zoom, e.deltaY)
        camera.updateProjectionMatrix()
      } else {
        sphRef.current.distance = zoomDistance(sphRef.current.distance, e.deltaY)
        applyToCamera(camera, sphRef.current, targetRef.current)
      }
    }

    const onContextMenu = (e: Event) => e.preventDefault()

    domElement.addEventListener('pointerdown', onPointerDown)
    domElement.addEventListener('pointermove', onPointerMove)
    domElement.addEventListener('pointerup', onPointerUp)
    domElement.addEventListener('pointercancel', onPointerUp)
    domElement.addEventListener('wheel', onWheel, { passive: false })
    domElement.addEventListener('contextmenu', onContextMenu)

    return () => {
      domElement.removeEventListener('pointerdown', onPointerDown)
      domElement.removeEventListener('pointermove', onPointerMove)
      domElement.removeEventListener('pointerup', onPointerUp)
      domElement.removeEventListener('pointercancel', onPointerUp)
      domElement.removeEventListener('wheel', onWheel)
      domElement.removeEventListener('contextmenu', onContextMenu)
    }
  }, [camera, domElement])

  // Animate any active transition.
  useFrame(() => {
    const t = transitionRef.current
    if (!t) return
    // Transitions are perspective-orbit only; orthographic poses are owned by CameraRig.
    if (camera instanceof THREE.OrthographicCamera) {
      transitionRef.current = null
      return
    }
    const elapsed = performance.now() - t.startTime
    const u = Math.min(1, elapsed / TRANSITION_MS)
    const ease = transitionEase(elapsed)
    sphRef.current = lerpSpherical(t.startSph, t.endSph, ease)
    targetRef.current.lerpVectors(t.startTarget, t.endTarget, ease)
    applyToCamera(camera, sphRef.current, targetRef.current)
    if (u >= 1) transitionRef.current = null
  })

  return null
}
