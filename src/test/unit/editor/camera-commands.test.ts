/**
 * Do the zoom and pan commands move the camera?
 *
 * `canvas.zoom.in`, `canvas.zoom.out` and `canvas.pan` were registered, offered
 * to the voice agent, and reported success while the view stood perfectly
 * still. They were then "fixed" by pointing them at `useEditorStore`'s
 * zoom/panX/panY, which no 3D component reads, so they went on reporting
 * success and standing still. A test that watched a store field would have
 * passed both times.
 *
 * So nothing here asserts on a store. Every expectation is on a real
 * THREE camera: an orthographic one for plan and section, a perspective one for
 * 3D. The camera is wired to the store through `subscribeCameraNudges`, which
 * is the same call `CustomOrbit` makes, and the commands are sent through the
 * real registry with the real client handlers mounted.
 */

import { createElement } from 'react'

import { render, type RenderResult } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { dispatch } from '@/lib/commands/dispatch'
import {
  applyCameraNudge,
  placeCamera,
  subscribeCameraNudges,
  type OrbitFrame,
} from '@/modules/editor/interactions/cameraNudge'
import {
  ISO_DEFAULT,
  MAX_DISTANCE,
  MIN_DISTANCE,
  ORTHO_ZOOM_MAX,
  ORTHO_ZOOM_MIN,
  perspectivePanSpeed,
} from '@/modules/editor/interactions/orbit'
import { useCameraStore } from '@/modules/editor/state/cameraStore'
import { useEditorStore } from '@/modules/editor/state/editorStore'

/** The zoom the plan and section cameras start at, straight out of CameraRig. */
const RIG_ORTHO_ZOOM = 20

/** `dispatch` only runs the client half once the server half answers ok. */
function stubServerOk(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: {} }),
    })),
  )
}

async function run(id: string, input: unknown = {}): Promise<void> {
  const result = await dispatch(id, input)
  if (!result.ok) throw new Error(`${id} was expected to succeed but said: ${result.error}`)
}

function newFrame(): OrbitFrame {
  return { spherical: { ...ISO_DEFAULT }, target: new THREE.Vector3(0, -1, 0) }
}

/** A plan camera as CameraRig builds it: overhead, orthographic, zoom 20. */
function planCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -200, 500)
  camera.position.set(0, 80, 0)
  camera.zoom = RIG_ORTHO_ZOOM
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

/** The 3D camera, placed at the iso pose the editor opens on. */
function isoCamera(frame: OrbitFrame): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.1, 500)
  placeCamera(camera, frame.spherical, frame.target)
  return camera
}

let mounted: RenderResult | null = null
let unsubscribe: (() => void) | null = null

beforeEach(() => {
  stubServerOk()
  useEditorStore.setState({ zoom: 1, panX: 0, panY: 0 })
  useCameraStore.setState({ nudge: null })
  mounted = render(createElement(ClientCommandHandlers))
})

afterEach(() => {
  unsubscribe?.()
  unsubscribe = null
  mounted?.unmount()
  mounted = null
  vi.unstubAllGlobals()
})

/** Point a camera at the store the way CustomOrbit does. */
function wire(camera: THREE.Camera, frame: OrbitFrame): void {
  unsubscribe = subscribeCameraNudges(camera, frame)
}

// ---------------------------------------------------------------------------
// Orthographic: plan and section
// ---------------------------------------------------------------------------

describe('zoom commands against the orthographic camera', () => {
  it('canvas.zoom.in raises the projection scale', async () => {
    // Ortho has no perspective, so moving the camera along its view axis
    // changes nothing on screen. `camera.zoom` is the only zoom it has.
    const camera = planCamera()
    wire(camera, newFrame())

    await run('canvas.zoom.in')

    expect(camera.zoom).toBeCloseTo(RIG_ORTHO_ZOOM * 1.2, 5)
  })

  it('canvas.zoom.out lowers the projection scale', async () => {
    const camera = planCamera()
    wire(camera, newFrame())

    await run('canvas.zoom.out')

    expect(camera.zoom).toBeCloseTo(RIG_ORTHO_ZOOM / 1.2, 5)
  })

  it('keeps moving on a repeated identical zoom', async () => {
    // The trap that makes a value-watching reader look correct: two zoom-ins in
    // a row leave every value in the store the same as the first one did.
    const camera = planCamera()
    wire(camera, newFrame())

    await run('canvas.zoom.in')
    const afterOne = camera.zoom
    await run('canvas.zoom.in')

    expect(camera.zoom).toBeGreaterThan(afterOne)
    expect(camera.zoom).toBeCloseTo(RIG_ORTHO_ZOOM * 1.2 * 1.2, 5)
  })

  it('honours a custom step', async () => {
    const camera = planCamera()
    wire(camera, newFrame())

    await run('canvas.zoom.in', { step: 2 })

    expect(camera.zoom).toBeCloseTo(RIG_ORTHO_ZOOM * 2, 5)
  })

  it('rewrites the projection matrix, not just the field', async () => {
    // A zoom that never reaches the projection matrix is invisible on screen.
    const camera = planCamera()
    const before = camera.projectionMatrix.clone()
    wire(camera, newFrame())

    await run('canvas.zoom.in')

    expect(camera.projectionMatrix.equals(before)).toBe(false)
  })

  it('stops at the clamps instead of inverting or vanishing', async () => {
    const camera = planCamera()
    wire(camera, newFrame())

    for (let i = 0; i < 60; i += 1) await run('canvas.zoom.out')
    expect(camera.zoom).toBeCloseTo(ORTHO_ZOOM_MIN, 5)
    expect(camera.zoom).toBeGreaterThan(0)

    for (let i = 0; i < 120; i += 1) await run('canvas.zoom.in')
    expect(camera.zoom).toBeCloseTo(ORTHO_ZOOM_MAX, 5)
  })
})

describe('canvas.pan against the orthographic camera', () => {
  it('slides the view right when asked to pan right', async () => {
    // Plan looks down at the ground with screen-right along +X, so panning the
    // viewport right walks the camera up the X axis.
    const camera = planCamera()
    const frame = newFrame()
    wire(camera, frame)

    await run('canvas.pan', { dx: 100, dy: 0 })

    // 100px at zoom 20 is 100/20 = 5 world units.
    expect(camera.position.x).toBeCloseTo(5, 4)
    expect(camera.position.y).toBeCloseTo(80, 4)
    expect(camera.position.z).toBeCloseTo(0, 4)
  })

  it('moves the orbit target with the camera', async () => {
    // Otherwise the next orbit or frame snaps the drawing back.
    const camera = planCamera()
    const frame = newFrame()
    wire(camera, frame)

    await run('canvas.pan', { dx: 100, dy: 0 })

    expect(frame.target.x).toBeCloseTo(5, 4)
  })

  it('pans further per pixel when zoomed out', async () => {
    // Pan speed is tied to zoom so a drag of N pixels covers N pixels of
    // drawing whatever the zoom. A fixed world-space step would crawl when
    // zoomed out and fly when zoomed in.
    const near = planCamera()
    const far = planCamera()
    far.zoom = RIG_ORTHO_ZOOM / 4
    far.updateProjectionMatrix()

    applyCameraNudge(near, newFrame(), { zoom: 1, panX: 100, panY: 0 })
    applyCameraNudge(far, newFrame(), { zoom: 1, panX: 100, panY: 0 })

    expect(far.position.x).toBeGreaterThan(near.position.x)
  })

  it('accumulates repeated pans', async () => {
    const camera = planCamera()
    wire(camera, newFrame())

    await run('canvas.pan', { dx: 100, dy: 0 })
    await run('canvas.pan', { dx: 100, dy: 0 })

    expect(camera.position.x).toBeCloseTo(10, 4)
  })

  it('leaves the camera alone when both axes are zero', async () => {
    const camera = planCamera()
    const before = camera.position.clone()
    wire(camera, newFrame())

    await run('canvas.pan', { dx: 0, dy: 0 })

    expect(camera.position.equals(before)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Perspective: the 3D view
// ---------------------------------------------------------------------------

describe('zoom commands against the perspective camera', () => {
  it('canvas.zoom.in walks the camera towards its target', async () => {
    // A perspective camera has a fixed field of view, so its only zoom is the
    // distance from the orbit target. Writing camera.zoom here would stretch
    // the projection against the FOV and never move the eye.
    const frame = newFrame()
    const camera = isoCamera(frame)
    const before = camera.position.distanceTo(frame.target)

    wire(camera, frame)
    await run('canvas.zoom.in')

    const after = camera.position.distanceTo(frame.target)
    expect(after).toBeLessThan(before)
    expect(after).toBeCloseTo(before / 1.2, 4)
  })

  it('canvas.zoom.out backs the camera off', async () => {
    const frame = newFrame()
    const camera = isoCamera(frame)
    const before = camera.position.distanceTo(frame.target)

    wire(camera, frame)
    await run('canvas.zoom.out')

    expect(camera.position.distanceTo(frame.target)).toBeCloseTo(before * 1.2, 4)
  })

  it('leaves the projection alone, and keeps looking at the target', async () => {
    const frame = newFrame()
    const camera = isoCamera(frame)
    const projection = camera.projectionMatrix.clone()

    wire(camera, frame)
    await run('canvas.zoom.in')

    expect(camera.projectionMatrix.equals(projection)).toBe(true)
    expect(camera.zoom).toBe(1)

    // Still pointed at the same place, just nearer to it.
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    const toTarget = frame.target.clone().sub(camera.position).normalize()
    expect(forward.dot(toTarget)).toBeCloseTo(1, 4)
  })

  it('stops at both distance clamps', async () => {
    const frame = newFrame()
    const camera = isoCamera(frame)
    wire(camera, frame)

    for (let i = 0; i < 40; i += 1) await run('canvas.zoom.out')
    expect(camera.position.distanceTo(frame.target)).toBeCloseTo(MAX_DISTANCE, 3)

    for (let i = 0; i < 60; i += 1) await run('canvas.zoom.in')
    const near = camera.position.distanceTo(frame.target)
    expect(near).toBeCloseTo(MIN_DISTANCE, 3)
    // Never through the target and out the other side.
    expect(near).toBeGreaterThan(0)
  })

  it('zooms the pose the pointer handlers are actually writing', async () => {
    // CustomOrbit replaces frame.spherical wholesale when the user orbits. A
    // subscription that captured the original object would zoom a pose nothing
    // else reads, and the camera would freeze after the first drag.
    const frame = newFrame()
    const camera = isoCamera(frame)
    wire(camera, frame)

    frame.spherical = { ...frame.spherical, azimuth: 1.4, distance: 40 }
    await run('canvas.zoom.in')

    expect(frame.spherical.distance).toBeCloseTo(40 / 1.2, 4)
    expect(camera.position.distanceTo(frame.target)).toBeCloseTo(40 / 1.2, 4)
  })
})

describe('canvas.pan against the perspective camera', () => {
  it('slides the view along screen-right without changing the distance', async () => {
    const frame = newFrame()
    const camera = isoCamera(frame)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    const startTarget = frame.target.clone()
    const distance = camera.position.distanceTo(frame.target)

    wire(camera, frame)
    await run('canvas.pan', { dx: 100, dy: 0 })

    const moved = frame.target.clone().sub(startTarget)
    expect(moved.length()).toBeCloseTo(100 * perspectivePanSpeed(distance), 4)
    expect(moved.clone().normalize().dot(right)).toBeCloseTo(1, 3)
    // Pan is not a zoom: the eye keeps its distance from what it is looking at.
    expect(camera.position.distanceTo(frame.target)).toBeCloseTo(distance, 4)
  })

  it('keeps the orbit target on the ground', async () => {
    // A target drifting off the ground plane turns every later orbit into a
    // swing around a point floating in mid-air.
    const frame = newFrame()
    const camera = isoCamera(frame)
    const startY = frame.target.y

    wire(camera, frame)
    await run('canvas.pan', { dx: 120, dy: -75 })

    expect(frame.target.y).toBeCloseTo(startY, 6)
  })

  it('moves the camera itself, not only the target', async () => {
    const frame = newFrame()
    const camera = isoCamera(frame)
    const before = camera.position.clone()

    wire(camera, frame)
    await run('canvas.pan', { dx: 100, dy: 40 })

    expect(before.distanceTo(camera.position)).toBeGreaterThan(1)
  })
})

// ---------------------------------------------------------------------------
// Nonsense input
// ---------------------------------------------------------------------------

describe('a nudge that cannot be honoured', () => {
  it('refuses a zoom factor of zero rather than collapsing the view', () => {
    const camera = planCamera()
    applyCameraNudge(camera, newFrame(), { zoom: 0, panX: 0, panY: 0 })
    expect(camera.zoom).toBe(RIG_ORTHO_ZOOM)
  })

  it('refuses a non-finite pan rather than parking the camera at NaN', () => {
    const frame = newFrame()
    const camera = isoCamera(frame)
    const before = camera.position.clone()
    applyCameraNudge(camera, frame, { zoom: 1, panX: Number.NaN, panY: 0 })
    expect(camera.position.equals(before)).toBe(true)
  })
})
