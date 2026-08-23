/**
 * Drag-to-move arithmetic and the guards that decide whether a press on a
 * shape may move it at all. Extracted from DragHandler, which could only be
 * exercised by dragging a real WebGL canvas.
 */

import { inches } from '@/lib/three/units'
import type { ScreenPoint } from './pointer'
import { normalizeToolId } from './toolIds'

/** Pointer travel before a press becomes a move rather than a click. */
export const DRAG_THRESHOLD_PX = 4

/** Grid step used while snapping is on, in inches (half a foot). */
export const SNAP_INCHES = 6

export interface DraggableShape {
  id: string
  x: number
  y: number
  locked: boolean
  hidden: boolean
}

export interface DragEligibility {
  activeTool: string
  shape: DraggableShape | null | undefined
  selectedIds: readonly string[]
}

/**
 * Whether this press starts a move.
 *
 * Four separate reasons it must not, each of which a user would report as a
 * different bug if it were wrong: the wrong tool is active (a measure drag
 * would shove the pool sideways), the shape was never selected (a press on a
 * neighbouring object would drag it out from under the cursor), the shape is
 * locked (the whole point of the lock), or it is hidden (an invisible object
 * cannot be under the cursor, so anything picking one is picking wrong).
 */
export function canDragShape({
  activeTool,
  shape,
  selectedIds,
}: DragEligibility): boolean {
  if (normalizeToolId(activeTool) !== 'tool.select') return false
  if (!shape) return false
  if (shape.locked || shape.hidden) return false
  return selectedIds.includes(shape.id)
}

/**
 * True once the pointer has travelled far enough for a press to become a drag.
 * Exactly at the threshold it is still a click, so a hand that shakes 4px while
 * clicking a shape does not nudge it.
 */
export function passesDragThreshold(
  start: ScreenPoint,
  current: ScreenPoint,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  return (
    Math.abs(current.x - start.x) > threshold ||
    Math.abs(current.y - start.y) > threshold
  )
}

/** Nearest point on the snap grid, in inches. */
export function snapToGrid(valueInches: number, step: number = SNAP_INCHES): number {
  if (!(step > 0)) return valueInches
  return Math.round(valueInches / step) * step
}

export interface DragTranslationInput {
  /** Ground-plane point, in feet, under the pointer when the press started. */
  startGroundX: number
  startGroundZ: number
  /** Ground-plane point, in feet, under the pointer now. */
  groundX: number
  groundZ: number
  /** Shape's stored top-left, in inches, when the press started. */
  startShapeX: number
  startShapeY: number
  snap: boolean
}

/**
 * Where the dragged shape's top-left lands, in inches.
 *
 * The delta is taken from the ground point the drag started at, not from the
 * shape's origin, so the shape keeps the same offset under the cursor for the
 * whole gesture instead of jumping its corner to the pointer on the first move.
 */
export function dragTranslation(input: DragTranslationInput): {
  x: number
  y: number
} {
  const rawX = input.startShapeX + inches(input.groundX - input.startGroundX)
  const rawY = input.startShapeY + inches(input.groundZ - input.startGroundZ)
  if (!input.snap) return { x: rawX, y: rawY }
  return { x: snapToGrid(rawX), y: snapToGrid(rawY) }
}

/**
 * True when the shape ended the drag exactly where it started.
 *
 * Committing one of these writes a history entry and an audit row for a move
 * that did not happen, so the user's next undo appears to do nothing at all.
 */
export function isNoOpMove(
  start: { x: number; y: number },
  end: { x: number; y: number },
): boolean {
  return start.x === end.x && start.y === end.y
}
