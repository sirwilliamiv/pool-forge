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
