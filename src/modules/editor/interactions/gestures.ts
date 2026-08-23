import { INCHES_PER_FOOT } from '@/lib/three/units'
/**
 * Decisions the placement gestures make, with no three.js or React attached.
 *
 * These were inline in ToolGestures, where the only way to exercise them was to
 * click a real canvas in a real browser.
 */

import { normalizeToolId } from './toolIds'

export type Point3 = [number, number, number]

/** Stencil each add-tool drops when the user clicks the ground. */
export const ADD_TOOL_STENCIL: Record<string, string> = {
  'tool.pool-shape': 'pool.rectangle',
  'tool.steps': 'pool.corner-steps',
  'tool.water-feature': 'water.waterfall',
  'tool.lights': 'feature.light',
  'tool.deck': 'deck.concrete',
}

/** Fallback when the pool tool is active but the picker has chosen nothing. */
export const DEFAULT_POOL_STENCIL = 'pool.rectangle'

/** Stencil the annotation tool places to carry the typed text. */
export const ANNOTATION_STENCIL = 'feature.deep-end-marker'

/**
 * Which stencil a click with this tool should place, or undefined when the tool
 * is not a placement tool at all (select, measure, brush, comment).
 *
 * The pool tool is the one whose stencil is chosen elsewhere: PoolShapePicker
 * writes `activeStencilId`, and a rectangle is the fallback so the tool still
 * places something when the picker has never been opened.
 */

/**
 * The smallest drag that counts as sizing a shape rather than clicking to place one.
 *
 * In feet, because the gesture is measured on the ground rather than on the
 * screen: two feet of yard is a deliberate drag at any zoom, where four pixels
 * means something different when the camera is close than when it is far away.
 */
export const MIN_DRAG_FT = 2

export interface GroundPoint {
  /** East, in scene feet. */
  x: number
  /** South, in scene feet. */
  z: number
}

export interface Placement {
  /** Left edge, in inches. Shapes store their top-left corner. */
  x: number
  /** Top edge, in inches. */
  y: number
  width: number
  height: number
}

/**
 * Where a new shape goes, from the press and the release.
 *
 * Two gestures, one function. A click places the stencil at its catalogue size,
 * centred on the point clicked. A drag places it in the rectangle that was
 * dragged out.
 *
 * Drag used to place nothing at all. The release was compared against the press
 * in pixels, anything past four of them was assumed to be a camera orbit, and
 * the gesture was dropped without a word, which from the user's side is
 * indistinguishable from the app ignoring them.
 *
 * The click case centres the shape, which it also did not do. `shape.x` is the
 * top-left corner and the renderer offsets by half the width, so passing the
 * clicked point straight through put the shape down and to the right of the
 * cursor by half its size. On a thirty foot pool that is fifteen feet.
 */
export function placementFrom(
  down: GroundPoint | null,
  up: GroundPoint,
  defaultSize: { widthIn: number; heightIn: number },
  minDragFt: number = MIN_DRAG_FT,
): Placement {
  const dx = down ? Math.abs(up.x - down.x) : 0
  const dz = down ? Math.abs(up.z - down.z) : 0

  // Both axes have to move. A drag along one edge alone would otherwise make a
  // shape with no thickness, which is not a pool and cannot be selected again.
  if (!down || dx < minDragFt || dz < minDragFt) {
    return {
      x: up.x * INCHES_PER_FOOT - defaultSize.widthIn / 2,
      y: up.z * INCHES_PER_FOOT - defaultSize.heightIn / 2,
      width: defaultSize.widthIn,
      height: defaultSize.heightIn,
    }
  }

  return {
    x: Math.min(down.x, up.x) * INCHES_PER_FOOT,
    y: Math.min(down.z, up.z) * INCHES_PER_FOOT,
    width: dx * INCHES_PER_FOOT,
    height: dz * INCHES_PER_FOOT,
  }
}

export function stencilForTool(
  toolId: string,
  activeStencilId: string | null,
): string | undefined {
  const tool = normalizeToolId(toolId)
  if (tool === 'tool.pool-shape') return activeStencilId ?? DEFAULT_POOL_STENCIL
  return ADD_TOOL_STENCIL[tool]
}

export interface MeasurePair {
  a: Point3 | null
  b: Point3 | null
}

/**
 * The measure tool's click cycle: first click sets A, second sets B, a third
 * starts a fresh measurement rather than leaving the old line stuck on screen.
 *
 * Setting A always clears B, otherwise the previous B would be drawn against
 * the new A and the label would read a distance the user never asked for.
 */
export function nextMeasurePoints(current: MeasurePair, p: Point3): MeasurePair {
  if (!current.a) return { a: p, b: null }
  if (!current.b) return { a: current.a, b: p }
  return { a: p, b: null }
}
