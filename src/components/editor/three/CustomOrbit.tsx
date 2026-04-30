'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  useCameraStore,
  type CameraView,
} from '@/modules/editor/state/cameraStore'

interface SphericalState {
  azimuth: number
  polar: number
  distance: number
}

const POLAR_MIN = 0.01
const POLAR_MAX = Math.PI / 2 - 0.01
const TRANSITION_MS = 300
const ROTATE_SPEED = 0.005
const PAN_SPEED_FACTOR = 0.0015
const ZOOM_FACTOR = 0.001
const MIN_DISTANCE = 5
const MAX_DISTANCE = 300

const ISO_DEFAULT: SphericalState = { azimuth: -0.756, polar: 0.92, distance: 65.9 }

const VIEW_POSES: Record<
  CameraView,
  { spherical: SphericalState; target: [number, number, number] }
> = {
  iso: { spherical: { ...ISO_DEFAULT }, target: [0, -1, 0] },
  top: { spherical: { azimuth: 0, polar: 0.05, distance: 60 }, target: [0, 0, 0] },
  front: {
    spherical: { azimuth: 0, polar: POLAR_MAX, distance: 50 },
    target: [0, 0, 0],
  },
  left: {
    spherical: { azimuth: -Math.PI / 2, polar: POLAR_MAX, distance: 50 },
    target: [0, 0, 0],
  },
  right: {
    spherical: { azimuth: Math.PI / 2, polar: POLAR_MAX, distance: 50 },
    target: [0, 0, 0],
  },
}

function applyToCamera(
  camera: THREE.Camera,
  sph: SphericalState,
  target: THREE.Vector3,
) {
  const sinPolar = Math.sin(sph.polar)
  const cosPolar = Math.cos(sph.polar)
  const sinAz = Math.sin(sph.azimuth)
  const cosAz = Math.cos(sph.azimuth)
  camera.position.set(
    target.x + sph.distance * sinPolar * cosAz,
    target.y + sph.distance * cosPolar,
    target.z + sph.distance * sinPolar * sinAz,
  )
  camera.lookAt(target)
  camera.updateMatrixWorld()
}

function easeInOutQuad(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
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

  const sphRef = useRef<SphericalState>({ ...ISO_DEFAULT })
  const targetRef = useRef(new THREE.Vector3(0, -1, 0))
  const transitionRef = useRef<Transition | null>(null)

  // Apply initial pose once when camera mounts (or swaps).
  useEffect(() => {
    applyToCamera(camera, sphRef.current, targetRef.current)
  }, [camera])

  // Trigger transition when the view-cube store ticks transitionToken.
  useEffect(() => {
    if (!targetView) return
    const pose = VIEW_POSES[targetView]
    if (!pose) return
    transitionRef.current = {
      startTime: performance.now(),
      startSph: { ...sphRef.current },
      endSph: { ...pose.spherical },
      startTarget: targetRef.current.clone(),
      endTarget: new THREE.Vector3(...pose.target),
    }
  }, [transitionToken, targetView])

  // Pointer-driven orbit + pan + zoom on the canvas DOM element.
  useEffect(() => {
    let dragging: 'rotate' | 'pan' | null = null
    let lastX = 0
    let lastY = 0

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2 || e.shiftKey) {
        dragging = 'pan'
      } else if (e.button === 0) {
        dragging = 'rotate'
      } else {
        return
      }
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
        sphRef.current.azimuth -= dx * ROTATE_SPEED
        sphRef.current.polar = Math.max(
          POLAR_MIN,
          Math.min(POLAR_MAX, sphRef.current.polar - dy * ROTATE_SPEED),
        )
      } else {
        // Pan along ground plane in camera-relative axes.
        const forward = new THREE.Vector3()
        camera.getWorldDirection(forward)
        forward.y = 0
        forward.normalize()
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
        const panSpeed = sphRef.current.distance * PAN_SPEED_FACTOR
        targetRef.current.addScaledVector(right, -dx * panSpeed)
        targetRef.current.addScaledVector(forward, dy * panSpeed)
      }
      applyToCamera(camera, sphRef.current, targetRef.current)
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
      const factor = Math.exp(e.deltaY * ZOOM_FACTOR)
      sphRef.current.distance = Math.max(
        MIN_DISTANCE,
        Math.min(MAX_DISTANCE, sphRef.current.distance * factor),
      )
      applyToCamera(camera, sphRef.current, targetRef.current)
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
    const now = performance.now()
    const u = Math.min(1, (now - t.startTime) / TRANSITION_MS)
    const ease = easeInOutQuad(u)
    sphRef.current.azimuth =
      t.startSph.azimuth + (t.endSph.azimuth - t.startSph.azimuth) * ease
    sphRef.current.polar =
      t.startSph.polar + (t.endSph.polar - t.startSph.polar) * ease
    sphRef.current.distance =
      t.startSph.distance + (t.endSph.distance - t.startSph.distance) * ease
    targetRef.current.lerpVectors(t.startTarget, t.endTarget, ease)
    applyToCamera(camera, sphRef.current, targetRef.current)
    if (u >= 1) transitionRef.current = null
  })

  return null
}
