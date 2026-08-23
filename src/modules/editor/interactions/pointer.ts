/**
 * Pointer maths shared by every canvas gesture handler.
 *
 * ToolGestures, SelectionPicker and DragHandler all used to carry their own
 * copy of "is this a click or a drag" and their own screen-to-NDC conversion.
 * Three copies of the same slop constant is three chances for placement,
 * selection and drag to disagree about what a click is.
 */

export interface ScreenPoint {
  x: number
  y: number
}

export interface RectLike {
  left: number
  top: number
  width: number
  height: number
}

/**
 * How far the pointer may travel between press and release and still count as
 * a click rather than a camera drag.
 */
export const CLICK_SLOP_PX = 4

/**
 * True when press and release are close enough to be one click.
 *
 * `down` is nullable on purpose: a handler whose pointerdown was swallowed by
 * an earlier listener (DragHandler stops propagation when a drag starts) has no
 * press to compare against, and must not fall back to a stale one.
 */
export function isClick(
  down: ScreenPoint | null,
  up: ScreenPoint,
  slop: number = CLICK_SLOP_PX,
): boolean {
  if (!down) return false
  return Math.abs(up.x - down.x) <= slop && Math.abs(up.y - down.y) <= slop
}

/**
 * Client coordinates to normalized device coordinates for the given canvas rect.
 *
 * Returns null for a degenerate rect (a canvas inside a collapsed panel, or one
 * measured before layout) instead of the NaN pair the raw arithmetic produces.
 * Callers bail on null, which is what they already did with NaN, just visibly.
 */
export function clientToNdc(
  clientX: number,
  clientY: number,
  rect: RectLike,
): ScreenPoint | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null
  return {
    x: ((clientX - rect.left) / rect.width) * 2 - 1,
    y: -((clientY - rect.top) / rect.height) * 2 + 1,
  }
}
