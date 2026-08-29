// The editor's movements: placing, selecting, dragging, orbiting.
//
// None of this was covered. Every one of these is a defect a user meets with a
// mouse in their hand and no error message anywhere: a click that places
// nothing, a lock that does not lock, a "frame selection" that blanks the
// scene. The logic lives in `src/modules/editor/interactions/` precisely so it
// can be checked here rather than by dragging a real WebGL canvas.

import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'

import { pickShapeId } from '@/lib/three/pick'
import {
  CLICK_SLOP_PX,
  clientToNdc,
  isClick,
} from '@/modules/editor/interactions/pointer'
import {
  ADD_TOOL_STENCIL,
  ANNOTATION_STENCIL,
  DEFAULT_POOL_STENCIL,
  nextMeasurePoints,
  stencilForTool,
  type Point3,
} from '@/modules/editor/interactions/gestures'
import {
  EDITOR_TOOL_IDS,
  isEditorToolId,
  normalizeToolId,
} from '@/modules/editor/interactions/toolIds'
import {
  DRAG_THRESHOLD_PX,
  SNAP_INCHES,
  canDragShape,
  dragTranslation,
  isNoOpMove,
  passesDragThreshold,
  snapToGrid,
  type DraggableShape,
} from '@/modules/editor/interactions/drag'
import {
  MAX_DISTANCE,
  MIN_DISTANCE,
  ORTHO_ZOOM_MAX,
  ORTHO_ZOOM_MIN,
  POLAR_MAX,
  POLAR_MIN,
  VIEW_POSES,
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
} from '@/modules/editor/interactions/orbit'
import { framingFor } from '@/modules/editor/framing'
import { HOTKEYS } from '@/modules/editor/hotkeys'
import { getStencil } from '@/modules/editor/stencils'
import { TOOLS, getTool, toolsByCategory } from '@/modules/editor/tools'
import { useEditorStore } from '@/modules/editor/state/editorStore'

// ---------------------------------------------------------------------------
// Click versus drag
// ---------------------------------------------------------------------------

describe('click slop', () => {
  const press = { x: 100, y: 100 }

  it('counts a perfectly still pointer as a click', () => {
    // The overwhelmingly common case: place a light exactly where you clicked.
    expect(isClick(press, { x: 100, y: 100 })).toBe(true)
  })

  it('still counts a click exactly at the slop distance', () => {
    // A hand that shakes 4px while clicking must still place the object. This
    // is the inclusive side of the boundary, and it is inclusive on both axes
    // at once, which a diagonal tremor produces.
    expect(isClick(press, { x: 104, y: 100 })).toBe(true)
    expect(isClick(press, { x: 100, y: 96 })).toBe(true)
    expect(isClick(press, { x: 104, y: 104 })).toBe(true)
  })

  it('stops counting one pixel past the slop, in every direction', () => {
    // One pixel further is an orbit. This is the threshold the placement tools
    // hand back to the camera: past it, a drag-to-draw creates nothing at all
    // and says nothing about it.
    expect(isClick(press, { x: 105, y: 100 })).toBe(false)
    expect(isClick(press, { x: 95, y: 100 })).toBe(false)
    expect(isClick(press, { x: 100, y: 105 })).toBe(false)
    expect(isClick(press, { x: 100, y: 95 })).toBe(false)
  })

  it('counts a long drag that returns to its start as a click', () => {
    // Only press and release are compared, so an orbit that ends where it began
    // places an object. Worth knowing: this is the one way a camera drag can
    // still drop a pool on the ground.
    expect(isClick(press, { x: 100, y: 100 })).toBe(true)
  })

  it('is not a click when there was no press', () => {
    // DragHandler swallows the pointerdown when a drag starts, and a press that
    // began on an overlay panel never reaches the canvas. Falling back to the
    // previous press used to clear the selection on release.
    expect(isClick(null, { x: 100, y: 100 })).toBe(false)
  })

  it('agrees with the drag threshold, so one gesture is never both', () => {
    // A press that has not moved enough to drag a shape must still be a click
    // that selects it; if these two constants drifted apart there would be a
    // dead band where a press neither selects nor moves.
    expect(CLICK_SLOP_PX).toBe(DRAG_THRESHOLD_PX)
    const atBoundary = { x: press.x + CLICK_SLOP_PX, y: press.y }
    expect(isClick(press, atBoundary)).toBe(true)
    expect(passesDragThreshold(press, atBoundary)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Screen to scene
// ---------------------------------------------------------------------------

describe('clientToNdc', () => {
  const rect = { left: 0, top: 0, width: 800, height: 600 }

  it('puts the centre of the canvas at the origin', () => {
    expect(clientToNdc(400, 300, rect)).toEqual({ x: 0, y: 0 })
  })

  it('puts the corners at the unit square, with y flipped', () => {
    // Screen y grows downward and NDC y grows upward. Getting this backwards
    // places objects mirrored across the horizon from the cursor.
    expect(clientToNdc(0, 0, rect)).toEqual({ x: -1, y: 1 })
    expect(clientToNdc(800, 600, rect)).toEqual({ x: 1, y: -1 })
  })

  it('subtracts the canvas offset, not just the window position', () => {
    // The canvas sits under a toolbar and beside a panel. Ignoring left/top
    // places every object a fixed distance from where the user clicked.
    const offset = { left: 100, top: 50, width: 400, height: 200 }
    expect(clientToNdc(300, 150, offset)).toEqual({ x: 0, y: 0 })
    expect(clientToNdc(100, 50, offset)).toEqual({ x: -1, y: 1 })
  })

  it('returns null for a canvas with no size instead of NaN', () => {
    // A collapsed panel or a pre-layout measurement gives a zero-size rect. The
    // raw arithmetic produces NaN, which travels into the raycaster and makes
    // every pick quietly miss.
    expect(clientToNdc(10, 10, { left: 0, top: 0, width: 0, height: 600 })).toBeNull()
    expect(clientToNdc(10, 10, { left: 0, top: 0, width: 800, height: 0 })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Which tool is active
// ---------------------------------------------------------------------------

describe('tool ids', () => {
  it('accepts the prefixed ids the Toolbar dispatches', () => {
    for (const id of EDITOR_TOOL_IDS) {
      expect(normalizeToolId(id)).toBe(id)
    }
  })

  it('resolves every keyboard tool shortcut to a tool that exists', () => {
    // The hotkey table sends bare names ('move', 'steps', 'measure') while
    // every reader matches the prefixed ids. Unresolved, pressing M armed
    // 'measure', which nothing recognised: the measure tool did nothing, the
    // toolbar button did not light up, and no error appeared anywhere.
    const toolHotkeys = HOTKEYS.filter((h) => h.commandId === 'tool.activate')
    expect(toolHotkeys.length).toBeGreaterThan(5)
    for (const hotkey of toolHotkeys) {
      const requested = (hotkey.input as { tool: string }).tool
      expect(
        isEditorToolId(requested),
        `${hotkey.shortcut} activates unknown tool "${requested}"`,
      ).toBe(true)
    }
  })

  it('maps the "move" tool to the select tool', () => {
    // The Toolbar labels the select tool "Move" and V sends 'move'. Two names,
    // one tool, or pressing V leaves you unable to drag anything.
    expect(normalizeToolId('move')).toBe('tool.select')
    expect(normalizeToolId('select')).toBe('tool.select')
    expect(normalizeToolId('tool.move')).toBe('tool.select')
  })

  it('leaves an unknown id alone rather than defaulting to select', () => {
    // A typo that silently becomes the select tool is a typo nobody ever finds.
    expect(normalizeToolId('tool.teleport')).toBe('tool.teleport')
    expect(isEditorToolId('tool.teleport')).toBe(false)
  })

  it('survives the store round trip, so hotkeys arm a usable tool', () => {
    const store = useEditorStore.getState()
    store.setActiveTool('measure')
    expect(useEditorStore.getState().activeTool).toBe('tool.measure')
    store.setActiveTool('pool-shape')
    expect(useEditorStore.getState().activeTool).toBe('tool.pool-shape')
    store.setActiveTool('move')
    expect(useEditorStore.getState().activeTool).toBe('tool.select')
  })
})

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

describe('stencilForTool', () => {
  it('places the right catalogue item for each add tool', () => {
    expect(stencilForTool('tool.steps', null)).toBe('pool.corner-steps')
    expect(stencilForTool('tool.water-feature', null)).toBe('water.waterfall')
    expect(stencilForTool('tool.lights', null)).toBe('feature.light')
    expect(stencilForTool('tool.deck', null)).toBe('deck.concrete')
  })

  it('works from the bare hotkey name too', () => {
    // Pressing S then clicking must place the same steps as clicking the button.
    expect(stencilForTool('steps', null)).toBe('pool.corner-steps')
    expect(stencilForTool('lights', null)).toBe('feature.light')
  })

  it('follows the pool picker when one is chosen', () => {
    expect(stencilForTool('tool.pool-shape', 'pool.grecian')).toBe('pool.grecian')
  })

  it('falls back to a rectangle when the picker was never opened', () => {
    // Arming the pool tool from the keyboard leaves activeStencilId null. A
    // click then has to place something, or R feels broken.
    expect(stencilForTool('tool.pool-shape', null)).toBe(DEFAULT_POOL_STENCIL)
    expect(getStencil(DEFAULT_POOL_STENCIL)).toBeDefined()
  })

  it('places nothing for the tools that are not placement tools', () => {
    // A click with the select, measure, brush or comment tool must never drop
    // an object on the drawing.
    expect(stencilForTool('tool.select', 'pool.grecian')).toBeUndefined()
    expect(stencilForTool('tool.measure', 'pool.grecian')).toBeUndefined()
    expect(stencilForTool('tool.material-brush', 'pool.grecian')).toBeUndefined()
    expect(stencilForTool('tool.comment', 'pool.grecian')).toBeUndefined()
    expect(stencilForTool('tool.annotation', 'pool.grecian')).toBeUndefined()
  })

  it('names stencils that exist in the catalogue', () => {
    // A missing stencil id would add a shape with no geometry and no price:
    // the click appears to work and the drawing gains an invisible object.
    for (const [tool, stencilId] of Object.entries(ADD_TOOL_STENCIL)) {
      expect(isEditorToolId(tool), `${tool} is not an activatable tool`).toBe(true)
      expect(getStencil(stencilId), `${stencilId} missing from catalogue`).toBeDefined()
    }
    expect(getStencil(ANNOTATION_STENCIL)).toBeDefined()
  })
})

describe('measure click cycle', () => {
  const a: Point3 = [1, 0, 2]
  const b: Point3 = [4, 0, 6]
  const c: Point3 = [9, 0, 9]

  it('sets A on the first click', () => {
    expect(nextMeasurePoints({ a: null, b: null }, a)).toEqual({ a, b: null })
  })

  it('sets B on the second click and keeps A put', () => {
    expect(nextMeasurePoints({ a, b: null }, b)).toEqual({ a, b })
  })

  it('starts a fresh measurement on the third click', () => {
    // Otherwise the old line stays on screen and the next click appears to do
    // nothing at all.
    expect(nextMeasurePoints({ a, b }, c)).toEqual({ a: c, b: null })
  })

  it('never leaves a stale B attached to a new A', () => {
    // A dangling B would draw a line to a point the user never clicked and
    // label it with a distance that was never measured.
    const restarted = nextMeasurePoints({ a, b }, c)
    expect(restarted.b).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Dragging shapes
// ---------------------------------------------------------------------------

function shape(overrides: Partial<DraggableShape> = {}): DraggableShape {
  return { id: 'pool-1', x: 0, y: 0, locked: false, hidden: false, ...overrides }
}

describe('canDragShape', () => {
  const selected = ['pool-1']

  it('drags a selected, unlocked shape with the select tool', () => {
    expect(
      canDragShape({ activeTool: 'tool.select', shape: shape(), selectedIds: selected }),
    ).toBe(true)
  })

  it('drags after the keyboard select shortcut too', () => {
    // V sends 'move'. Before it was normalized, pressing V made every shape
    // undraggable until you clicked the toolbar button.
    expect(
      canDragShape({ activeTool: 'move', shape: shape(), selectedIds: selected }),
    ).toBe(true)
  })

  it('refuses to move a locked shape', () => {
    // The lock exists so a finished pool cannot be nudged while detailing the
    // deck around it.
    expect(
      canDragShape({
        activeTool: 'tool.select',
        shape: shape({ locked: true }),
        selectedIds: selected,
      }),
    ).toBe(false)
  })

  it('refuses to move a hidden shape', () => {
    // Nothing invisible is under the cursor, so a pick that returns one is
    // wrong and dragging it moves something the user cannot see.
    expect(
      canDragShape({
        activeTool: 'tool.select',
        shape: shape({ hidden: true }),
        selectedIds: selected,
      }),
    ).toBe(false)
  })

  it('refuses to move a shape that was never selected', () => {
    // Press-and-drag on an unselected object selects it; it must not also fly
    // out from under the cursor on the same gesture.
    expect(
      canDragShape({ activeTool: 'tool.select', shape: shape(), selectedIds: [] }),
    ).toBe(false)
    expect(
      canDragShape({
        activeTool: 'tool.select',
        shape: shape(),
        selectedIds: ['deck-9'],
      }),
    ).toBe(false)
  })

  it('drags one member of a multi-selection', () => {
    expect(
      canDragShape({
        activeTool: 'tool.select',
        shape: shape(),
        selectedIds: ['deck-9', 'pool-1', 'spa-2'],
      }),
    ).toBe(true)
  })

  it('refuses every tool except select', () => {
    // A drag with the measure or brush tool armed must move the camera, not
    // the drawing.
    for (const tool of ['tool.measure', 'tool.deck', 'tool.material-brush', 'tool.pan']) {
      expect(
        canDragShape({ activeTool: tool, shape: shape(), selectedIds: selected }),
        `${tool} should not drag shapes`,
      ).toBe(false)
    }
  })

  it('refuses when the pick found no shape at all', () => {
    expect(
      canDragShape({ activeTool: 'tool.select', shape: null, selectedIds: selected }),
    ).toBe(false)
  })
})

describe('drag threshold', () => {
  const start = { x: 200, y: 200 }

  it('does not move the shape for a still pointer', () => {
    expect(passesDragThreshold(start, { x: 200, y: 200 })).toBe(false)
  })

  it('does not move the shape at exactly the threshold', () => {
    // 4px of hand tremor while clicking must not nudge a placed pool.
    expect(passesDragThreshold(start, { x: 204, y: 204 })).toBe(false)
    expect(passesDragThreshold(start, { x: 196, y: 196 })).toBe(false)
  })

  it('moves the shape one pixel past the threshold, on either axis', () => {
    expect(passesDragThreshold(start, { x: 205, y: 200 })).toBe(true)
    expect(passesDragThreshold(start, { x: 200, y: 205 })).toBe(true)
    expect(passesDragThreshold(start, { x: 195, y: 200 })).toBe(true)
    expect(passesDragThreshold(start, { x: 200, y: 195 })).toBe(true)
  })
})

describe('dragTranslation', () => {
  const base = {
    startGroundX: 10,
    startGroundZ: 20,
    startShapeX: 120,
    startShapeY: 240,
    snap: false,
  }

  it('converts ground feet into stored inches', () => {
    // The scene is in feet and the store is in inches. A 3ft drag that moved
    // the shape 3in would look like the drawing had stopped tracking the mouse.
    const moved = dragTranslation({ ...base, groundX: 13, groundZ: 20 })
    expect(moved.x).toBeCloseTo(156, 10)
    expect(moved.y).toBeCloseTo(240, 10)
  })

  it('moves the shape the other way for a negative delta', () => {
    const moved = dragTranslation({ ...base, groundX: 8, groundZ: 15 })
    expect(moved.x).toBeCloseTo(96, 10)
    expect(moved.y).toBeCloseTo(180, 10)
  })

  it('leaves the shape exactly where it was for a zero-distance drag', () => {
    // Press, wiggle past the threshold, come back, release. Unsnapped this must
    // be pixel-identical, or every aborted drag shifts the drawing slightly.
    const moved = dragTranslation({ ...base, groundX: 10, groundZ: 20 })
    expect(moved).toEqual({ x: 120, y: 240 })
  })

  it('keeps sub-inch precision when snapping is off', () => {
    // 0.1ft is 1.2in. Rounding it away would make fine positioning impossible.
    const moved = dragTranslation({ ...base, groundX: 10.1, groundZ: 20 })
    expect(moved.x).toBeCloseTo(121.2, 6)
  })

  it('snaps to the half-foot grid when snapping is on', () => {
    const moved = dragTranslation({
      ...base,
      groundX: 10.7,
      groundZ: 20,
      snap: true,
    })
    // 120in + 8.4in = 128.4in, nearest 6in step is 126in (10ft 6in).
    expect(moved.x).toBe(126)
    expect(moved.y).toBe(240)
  })

  it('snaps a zero-distance drag to the grid, moving a shape that was off-grid', () => {
    // Worth pinning: with snapping on, a drag that goes nowhere still relocates
    // an off-grid shape by up to 3in. That is the grid doing its job, but it is
    // also why an "accidental" drag can visibly shift a hand-placed object.
    const moved = dragTranslation({
      ...base,
      startShapeX: 121,
      startShapeY: 244,
      groundX: 10,
      groundZ: 20,
      snap: true,
    })
    expect(moved).toEqual({ x: 120, y: 246 })
  })
})

describe('snapToGrid', () => {
  it('uses a half-foot step', () => {
    expect(SNAP_INCHES).toBe(6)
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(5)).toBe(6)
    expect(snapToGrid(2)).toBe(0)
    expect(snapToGrid(-7)).toBe(-6)
  })

  it('breaks a tie upward, consistently on both sides of zero', () => {
    // A tie that resolved differently for negative coordinates would make a
    // shape drift when dragged back and forth across the origin.
    expect(snapToGrid(3)).toBe(6)
    expect(snapToGrid(-3)).toBeCloseTo(0, 10)
    expect(snapToGrid(9)).toBe(12)
    expect(snapToGrid(-9)).toBe(-6)
  })
})

describe('isNoOpMove', () => {
  it('recognises a drag that ended where it started', () => {
    // Committing one of these writes a history entry and an audit row for a
    // move that never happened, so the next undo appears to do nothing.
    expect(isNoOpMove({ x: 120, y: 240 }, { x: 120, y: 240 })).toBe(true)
  })

  it('does not swallow a real move, however small', () => {
    expect(isNoOpMove({ x: 120, y: 240 }, { x: 120.5, y: 240 })).toBe(false)
    expect(isNoOpMove({ x: 120, y: 240 }, { x: 120, y: 239 })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

function domStub(width = 800, height = 600, left = 0, top = 0): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLElement
}

function overheadCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 1000)
  camera.position.set(0, 20, 0)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}

function slab(id: string | null, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.5, 4),
    new THREE.MeshBasicMaterial(),
  )
  mesh.position.set(0, y, 0)
  if (id) mesh.userData.id = id
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('pickShapeId', () => {
  const camera = overheadCamera()
  const dom = domStub()
  let raycaster: THREE.Raycaster

  beforeEach(() => {
    raycaster = new THREE.Raycaster()
  })

  it('picks the shape under the cursor', () => {
    const scene = new THREE.Scene()
    scene.add(slab('deck-1', 0))
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, dom, 400, 300)).toBe('deck-1')
  })

  it('picks the topmost of two overlapping shapes', () => {
    // A spa sitting on a deck: clicking it must select the spa, not the deck
    // underneath. Scene order must not decide this, camera distance must.
    const scene = new THREE.Scene()
    scene.add(slab('deck-below', 0))
    scene.add(slab('spa-above', 3))
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, dom, 400, 300)).toBe('spa-above')
  })

  it('picks the same shape whichever order they were added', () => {
    const scene = new THREE.Scene()
    scene.add(slab('spa-above', 3))
    scene.add(slab('deck-below', 0))
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, dom, 400, 300)).toBe('spa-above')
  })

  it('reaches what is underneath once the shape above is gone', () => {
    // Hidden shapes are not rendered at all, so hiding the spa must expose the
    // deck rather than leaving a hole nothing can be selected through.
    const scene = new THREE.Scene()
    scene.add(slab('deck-below', 0))
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, dom, 400, 300)).toBe('deck-below')
  })

  it('reports the group id when the mesh itself is anonymous', () => {
    // A pool is a group of meshes: water, coping, tile band. Clicking the tile
    // band has to select the pool, not nothing.
    const group = new THREE.Group()
    group.userData.id = 'pool-7'
    group.add(slab(null, 0))
    const scene = new THREE.Scene()
    scene.add(group)
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, dom, 400, 300)).toBe('pool-7')
  })

  it('returns null when the click misses everything', () => {
    // This is what clears the selection, so it must not misfire.
    const scene = new THREE.Scene()
    scene.add(slab('deck-1', 0))
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, dom, 5, 5)).toBeNull()
  })

  it('returns null for a canvas with no size', () => {
    // Rather than feeding a NaN ray into the raycaster and picking at random.
    const scene = new THREE.Scene()
    scene.add(slab('deck-1', 0))
    scene.updateMatrixWorld(true)
    expect(pickShapeId(raycaster, camera, scene, domStub(0, 0), 0, 0)).toBeNull()
  })

  it('accounts for a canvas that is offset in the window', () => {
    // The canvas sits below the header and right of the panel. The centre of
    // the canvas is not the centre of the window.
    const scene = new THREE.Scene()
    scene.add(slab('deck-1', 0))
    scene.updateMatrixWorld(true)
    const offset = domStub(800, 600, 260, 64)
    expect(pickShapeId(raycaster, camera, scene, offset, 660, 364)).toBe('deck-1')
    expect(pickShapeId(raycaster, camera, scene, offset, 400, 300)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

describe('resolveDragMode', () => {
  it('rotates on a plain left drag in 3D', () => {
    expect(resolveDragMode({ button: 0 }, false)).toBe('rotate')
  })

  it('pans on right drag and on shift drag', () => {
    expect(resolveDragMode({ button: 2 }, false)).toBe('pan')
    expect(resolveDragMode({ button: 0, shiftKey: true }, false)).toBe('pan')
  })

  it('never rotates an orthographic view', () => {
    // Plan and section are drawings, not models. A tilted plan view is a broken
    // plan view, and there is no control to put it back.
    expect(resolveDragMode({ button: 0 }, true)).toBe('pan')
    expect(resolveDragMode({ button: 2 }, true)).toBe('pan')
  })

  it('ignores the middle button in 3D', () => {
    // Middle-drag is the browser's autoscroll; claiming it would fight the page.
    expect(resolveDragMode({ button: 1 }, false)).toBeNull()
  })
})

describe('orbit rotation', () => {
  const start = { azimuth: 0, polar: 0.92, distance: 60 }

  it('turns the camera the opposite way to the drag', () => {
    // Dragging right must swing the scene right, which means the camera swings
    // left around it. Inverted, the model appears to fight the mouse.
    expect(rotateSpherical(start, 100, 0).azimuth).toBeCloseTo(-0.5, 10)
    expect(rotateSpherical(start, -100, 0).azimuth).toBeCloseTo(0.5, 10)
  })

  it('stops just short of straight overhead', () => {
    // At exactly vertical the up vector degenerates and the view spins wildly.
    expect(rotateSpherical(start, 0, -1000).polar).toBeCloseTo(POLAR_MAX, 10)
    expect(rotateSpherical(start, 0, -1000).polar).toBeLessThan(Math.PI / 2)
  })

  it('stops at the horizon rather than going below ground', () => {
    // Under the ground plane the pool is invisible and the user is lost.
    expect(rotateSpherical(start, 0, 1000).polar).toBe(POLAR_MIN)
  })

  it('leaves the distance untouched while rotating', () => {
    expect(rotateSpherical(start, 250, -80).distance).toBe(60)
  })

  it('lets azimuth wrap forever, so a spin never jams', () => {
    let sph = start
    for (let i = 0; i < 40; i += 1) sph = rotateSpherical(sph, 100, 0)
    expect(sph.azimuth).toBeCloseTo(-20, 6)
    expect(Number.isFinite(sph.azimuth)).toBe(true)
  })
})

describe('wheel zoom', () => {
  it('pulls the 3D camera back when scrolling down and in when scrolling up', () => {
    expect(zoomDistance(60, 100)).toBeCloseTo(60 * Math.exp(0.1), 6)
    expect(zoomDistance(60, 100)).toBeGreaterThan(60)
    expect(zoomDistance(60, -100)).toBeLessThan(60)
  })

  it('clamps the 3D camera at both ends', () => {
    // Past the near limit the camera ends up inside the pool shell; past the
    // far limit the drawing is a dot and scrolling back takes forever.
    expect(zoomDistance(6, -100000)).toBe(MIN_DISTANCE)
    expect(zoomDistance(280, 100000)).toBe(MAX_DISTANCE)
  })

  it('zooms plan and section the same direction as 3D', () => {
    // Ortho zoom is inverted (higher zoom is closer), so the sign has to flip
    // with it or the wheel reverses when you switch to plan view.
    expect(zoomOrthoLevel(20, 100)).toBeLessThan(20)
    expect(zoomOrthoLevel(20, -100)).toBeGreaterThan(20)
  })

  it('clamps plan and section zoom at both ends', () => {
    expect(zoomOrthoLevel(3, 100000)).toBe(ORTHO_ZOOM_MIN)
    expect(zoomOrthoLevel(300, -100000)).toBe(ORTHO_ZOOM_MAX)
  })

  it('is reversible: a tick out then a tick in returns to the same place', () => {
    // Otherwise repeated scrolling drifts and the drawing creeps away.
    expect(zoomDistance(zoomDistance(60, 120), -120)).toBeCloseTo(60, 10)
    expect(zoomOrthoLevel(zoomOrthoLevel(20, 120), -120)).toBeCloseTo(20, 10)
  })
})

describe('pan speed', () => {
  it('slows the plan-view pan as the user zooms in', () => {
    // Pan must track the cursor: at 2x zoom a pixel of drag is half a world
    // unit. A fixed speed makes the drawing shoot away when zoomed in.
    expect(orthoPanSpeed(20)).toBeCloseTo(0.05, 10)
    expect(orthoPanSpeed(40)).toBeCloseTo(0.025, 10)
  })

  it('survives a zero zoom instead of panning to infinity', () => {
    expect(Number.isFinite(orthoPanSpeed(0))).toBe(true)
  })

  it('scales the 3D pan with how far the camera is', () => {
    // Far away, a pixel covers more ground. Equal speeds make a zoomed-out pan
    // feel stuck.
    expect(perspectivePanSpeed(60)).toBeCloseTo(0.09, 10)
    expect(perspectivePanSpeed(300)).toBeGreaterThan(perspectivePanSpeed(60))
  })
})

describe('sphericalToPosition', () => {
  it('puts a near-zero polar angle overhead', () => {
    const [x, y, z] = sphericalToPosition(
      { azimuth: 0, polar: POLAR_MIN, distance: 60 },
      [0, 0, 0],
    )
    expect(y).toBeGreaterThan(59.9)
    expect(Math.hypot(x, z)).toBeLessThan(1)
  })

  it('puts a near-horizontal polar angle at eye level', () => {
    const [, y] = sphericalToPosition(
      { azimuth: 0, polar: POLAR_MAX, distance: 50 },
      [0, 0, 0],
    )
    expect(y).toBeGreaterThan(0)
    expect(y).toBeLessThan(1)
  })

  it('orbits around the target, not the origin', () => {
    // Framing a pool at the far corner of the site and then orbiting must keep
    // the pool centred instead of swinging it out of view.
    const [x, y, z] = sphericalToPosition(
      { azimuth: 0, polar: POLAR_MAX, distance: 50 },
      [100, 2, -40],
    )
    expect(x).toBeCloseTo(150, 1)
    expect(z).toBeCloseTo(-40, 1)
    // A horizon pose sits at the target's height, not the world's: a target
    // raised 2ft puts the camera 2ft up too.
    expect(y - 2).toBeLessThan(1)
    expect(y - 2).toBeGreaterThan(0)
  })

  it('keeps the same distance from the target at any angle', () => {
    const target: [number, number, number] = [10, 0, -5]
    for (const azimuth of [-2, -0.756, 0, 1.3, 3]) {
      const p = sphericalToPosition({ azimuth, polar: 0.92, distance: 65.9 }, target)
      const away = Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2])
      expect(away).toBeCloseTo(65.9, 6)
    }
  })
})

describe('poseToSpherical', () => {
  it('reads a pose above the target as looking down', () => {
    const sph = poseToSpherical([0, 60, 0], [0, 0, 0])
    expect(sph.distance).toBe(60)
    expect(sph.polar).toBe(POLAR_MIN)
  })

  it('reads a pose level with the target as looking along the ground', () => {
    // The height ratio here is exactly zero. Read as a falsy value it became a
    // ratio of 1, which is straight overhead: framing a selection from ground
    // level snapped the camera to a plan view.
    const sph = poseToSpherical([50, 0, 0], [0, 0, 0])
    expect(sph.polar).toBeCloseTo(POLAR_MAX, 6)
    const [, y] = sphericalToPosition(sph, [0, 0, 0])
    expect(y).toBeLessThan(1)
  })

  it('keeps the compass direction of the pose', () => {
    expect(poseToSpherical([0, 10, 50], [0, 0, 0]).azimuth).toBeCloseTo(Math.PI / 2, 6)
    expect(poseToSpherical([-50, 10, 0], [0, 0, 0]).azimuth).toBeCloseTo(Math.PI, 6)
  })

  it('clamps a pose that is too close or too far', () => {
    expect(poseToSpherical([1, 1, 1], [0, 0, 0]).distance).toBe(MIN_DISTANCE)
    expect(poseToSpherical([0, 1000, 0], [0, 0, 0]).distance).toBe(MAX_DISTANCE)
  })

  it('survives a pose sitting exactly on its target', () => {
    const sph = poseToSpherical([7, 2, -3], [7, 2, -3])
    expect(Number.isFinite(sph.polar)).toBe(true)
    expect(Number.isFinite(sph.azimuth)).toBe(true)
    expect(sph.distance).toBe(MIN_DISTANCE)
  })

  it('frames a site too large for the distance limit without blanking the scene', () => {
    // A 212ft-square site needs the camera 627 units back, which clamps to 300
    // while the height stays at 300.7. The unclamped ratio is greater than 1,
    // acos of which is NaN: the camera position became NaN and the whole 3D
    // view went blank until the user picked a face on the view cube.
    const framing = framingFor({ x: 0, y: 0, width: 2544, height: 2544 })
    const sph = poseToSpherical(framing.pose, framing.target)
    expect(Number.isNaN(sph.polar)).toBe(false)
    expect(sph.polar).toBeGreaterThanOrEqual(POLAR_MIN)
    expect(sph.polar).toBeLessThanOrEqual(POLAR_MAX)
    const position = sphericalToPosition(sph, framing.target)
    expect(position.every((n) => Number.isFinite(n))).toBe(true)
  })

  it('round-trips a pose the framing helper produces for a normal yard', () => {
    // 40ft x 20ft pool: the camera must end up where framingFor asked, or
    // "frame selection" quietly reframes to somewhere else.
    const framing = framingFor({ x: 0, y: 0, width: 480, height: 240 })
    const sph = poseToSpherical(framing.pose, framing.target)
    const [x, y, z] = sphericalToPosition(sph, framing.target)
    expect(x).toBeCloseTo(framing.pose[0], 4)
    expect(y).toBeCloseTo(framing.pose[1], 4)
    expect(z).toBeCloseTo(framing.pose[2], 4)
  })
})

describe('view transitions', () => {
  it('starts still and ends exactly on the pose', () => {
    // A transition that stops at 0.98 leaves the view cube face looking wrong.
    expect(transitionEase(0)).toBe(0)
    expect(transitionEase(300)).toBe(1)
  })

  it('holds at the end once the duration has passed', () => {
    expect(transitionEase(900)).toBe(1)
  })

  it('is halfway through the motion at halfway through the time', () => {
    expect(transitionEase(150)).toBeCloseTo(0.5, 10)
  })

  it('eases: it moves less at the start than in the middle', () => {
    const early = transitionEase(30) - transitionEase(0)
    const middle = transitionEase(165) - transitionEase(135)
    expect(middle).toBeGreaterThan(early)
  })

  it('lands on the end pose exactly, with no drift on any axis', () => {
    const from = { azimuth: -0.756, polar: 0.92, distance: 65.9 }
    const to = VIEW_POSES.top.spherical
    expect(lerpSpherical(from, to, 0)).toEqual(from)
    const landed = lerpSpherical(from, to, 1)
    expect(landed.azimuth).toBeCloseTo(to.azimuth, 10)
    expect(landed.polar).toBeCloseTo(to.polar, 10)
    expect(landed.distance).toBeCloseTo(to.distance, 10)
    expect(lerpSpherical(from, to, 0.5).distance).toBeCloseTo((65.9 + 60) / 2, 10)
  })
})

describe('view cube poses', () => {
  it('keeps every pose inside the camera limits', () => {
    // A pose outside the clamps would jump on the first orbit after using it.
    for (const [name, pose] of Object.entries(VIEW_POSES)) {
      expect(pose.spherical.polar, name).toBeGreaterThanOrEqual(POLAR_MIN)
      expect(pose.spherical.polar, name).toBeLessThanOrEqual(POLAR_MAX)
      expect(pose.spherical.distance, name).toBeGreaterThanOrEqual(MIN_DISTANCE)
      expect(pose.spherical.distance, name).toBeLessThanOrEqual(MAX_DISTANCE)
    }
  })

  it('looks down from the top view and across from the elevations', () => {
    const top = sphericalToPosition(VIEW_POSES.top.spherical, VIEW_POSES.top.target)
    expect(top[1]).toBeGreaterThan(0.99 * VIEW_POSES.top.spherical.distance)
    for (const name of ['front', 'left', 'right'] as const) {
      const p = sphericalToPosition(VIEW_POSES[name].spherical, VIEW_POSES[name].target)
      expect(p[1], name).toBeLessThan(1)
    }
  })

  it('puts left and right on opposite sides', () => {
    const left = sphericalToPosition(VIEW_POSES.left.spherical, VIEW_POSES.left.target)
    const right = sphericalToPosition(VIEW_POSES.right.spherical, VIEW_POSES.right.target)
    expect(Math.sign(left[2])).toBe(-Math.sign(right[2]))
    expect(Math.abs(left[2])).toBeCloseTo(Math.abs(right[2]), 6)
  })

  it('gives the iso view an angle that is neither plan nor elevation', () => {
    const iso = VIEW_POSES.iso.spherical
    expect(iso.polar).toBeGreaterThan(0.3)
    expect(iso.polar).toBeLessThan(POLAR_MAX - 0.3)
  })
})

// ---------------------------------------------------------------------------
// Tool catalogue
// ---------------------------------------------------------------------------

describe('tool catalogue', () => {
  it('has no duplicate ids', () => {
    // Duplicates make getTool return whichever came first, so the docs page and
    // the voice agent describe the wrong tool.
    const ids = TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('namespaces every id', () => {
    for (const tool of TOOLS) expect(tool.id.startsWith('tool.'), tool.id).toBe(true)
  })

  it('fills in every field a user or the voice agent reads', () => {
    // An empty tooltip or description renders as a blank row in the docs, and
    // a tool with no voice examples is a tool the agent will never offer.
    for (const tool of TOOLS) {
      expect(tool.name.trim(), tool.id).not.toBe('')
      expect(tool.icon.trim(), tool.id).not.toBe('')
      expect(tool.tooltip.trim(), tool.id).not.toBe('')
      expect(tool.description.trim(), tool.id).not.toBe('')
      expect(tool.undoBehavior.trim(), tool.id).not.toBe('')
      expect(tool.voiceCommandExamples.length, tool.id).toBeGreaterThan(0)
      for (const example of tool.voiceCommandExamples) {
        expect(example.trim(), tool.id).not.toBe('')
      }
    }
  })

  it('files each tool under the category it claims', () => {
    // The docs page groups by bucket and prints the category, so a mismatch
    // shows a "drawing" tool under Measurement.
    const buckets = toolsByCategory()
    for (const [category, tools] of Object.entries(buckets)) {
      for (const tool of tools) expect(tool.category, tool.id).toBe(category)
    }
  })

  it('exposes every catalogued tool through the buckets, and nothing extra', () => {
    const fromBuckets = Object.values(toolsByCategory()).flat().map((t) => t.id)
    expect(fromBuckets.sort()).toEqual(TOOLS.map((t) => t.id).sort())
  })

  it('never gives two tools the same shortcut', () => {
    // Two tools on one key means one of them is unreachable and its tooltip
    // advertises a key that does something else.
    const shortcuts = TOOLS.map((t) => t.shortcut).filter(
      (s): s is string => typeof s === 'string',
    )
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
  })

  it('backs every advertised shortcut with a real key binding', () => {
    // The tooltip that says "V" has to actually be wired, or the docs teach a
    // shortcut that does nothing.
    const bound = new Set(HOTKEYS.map((h) => h.shortcut))
    for (const tool of TOOLS) {
      if (!tool.shortcut) continue
      expect(bound.has(tool.shortcut), `${tool.id} claims ${tool.shortcut}`).toBe(true)
    }
  })

  it('looks tools up by id and admits when one does not exist', () => {
    expect(getTool('tool.select')?.name).toBe('Select')
    expect(getTool('tool.does-not-exist')).toBeUndefined()
  })
})
