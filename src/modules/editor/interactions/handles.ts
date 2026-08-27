// Resizing and rotating a selection by dragging it, with no three.js attached.
//
// The only way to change a pool's size used to be typing into the inspector.
// Every drawing tool anybody has used puts handles on a selection, so their
// absence read as the app being unfinished rather than as a deliberate choice.
//
// All arithmetic here is in inches, which is what `Shape` stores, and `x`/`y`
// are the TOP-LEFT corner rather than the centre. The renderer offsets by half
// the width and rotates about the centre, and getting that backwards is what
// once placed every clicked shape half its own size away from the cursor.

/** Corners, then edges. The rotate grip is handled separately: it is not a resize. */
export const RESIZE_HANDLES = [
  'nw', 'ne', 'se', 'sw',
  'n', 'e', 's', 'w',
] as const

export type ResizeHandle = (typeof RESIZE_HANDLES)[number]

/**
 * Smallest thing worth having on a drawing, in inches.
 *
 * A shape below this is hard to grab again, and a zero-extent one cannot be
 * clicked at all: the drag that made it also loses it.
 */
export const MIN_SIZE_IN = 12

/**
 * Largest, in inches. Four hundred feet.
 *
 * A pool cannot be bigger than the lot and a lot is not half a mile wide. This
 * exists because nothing bounded a dimension before: a tester typed 99999 into
 * the inspector, the app took it, and quoted the job at $144,116,399.
 */
export const MAX_SIZE_IN = 400 * 12

/** Degrees a rotation snaps to when the user asks for a snap. */
export const ROTATE_SNAP_DEG = 15

export interface Box {
  /** Left edge in inches, before rotation. */
  x: number
  /** Top edge in inches, before rotation. */
  y: number
  width: number
  height: number
  /** Clockwise about the centre, in degrees. */
  rotation: number
}

export interface Point {
  x: number
  y: number
}

const rad = (deg: number) => (deg * Math.PI) / 180
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function centreOf(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Rotate `p` about the origin by `deg`. */
function spin(p: Point, deg: number): Point {
  const a = rad(deg)
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }
}

/** A world point in the shape's own unrotated frame, relative to its centre. */
export function toLocal(box: Box, world: Point): Point {
  const c = centreOf(box)
  return spin({ x: world.x - c.x, y: world.y - c.y }, -box.rotation)
}

/** The inverse of `toLocal`. */
export function toWorld(box: Box, local: Point): Point {
  const c = centreOf(box)
  const p = spin(local, box.rotation)
  return { x: p.x + c.x, y: p.y + c.y }
}

/** Which axes a handle moves. An edge handle moves one; a corner moves both. */
function axesFor(handle: ResizeHandle): { x: -1 | 0 | 1; y: -1 | 0 | 1 } {
  const x = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0
  const y = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0
  return { x, y }
}

/**
 * Where each grab point sits, in world inches, rotation included.
 *
 * Returned in the same order as `RESIZE_HANDLES` so a renderer can zip the two
 * together without knowing the geometry.
 */
export function handlePositions(box: Box): Array<{ handle: ResizeHandle; at: Point }> {
  const hw = box.width / 2
  const hh = box.height / 2
  return RESIZE_HANDLES.map((handle) => {
    const { x, y } = axesFor(handle)
    return { handle, at: toWorld(box, { x: x * hw, y: y * hh }) }
  })
}

/** Where the rotate grip sits: off the top edge, far enough not to fight the north handle. */
export function rotateGripPosition(box: Box, standoffIn = 24): Point {
  return toWorld(box, { x: 0, y: -(box.height / 2 + standoffIn) })
}

export interface ResizeOptions {
  /** Keep the width-to-height ratio the shape started with. */
  preserveRatio?: boolean
}

/**
 * The box you get by dragging one handle to a point.
 *
 * The opposite corner stays where it is, which is the behaviour every drawing
 * tool has and the thing that makes a resize feel like a resize rather than a
 * move. An edge handle pins the opposite edge and leaves the other axis alone.
 *
 * Dragging a handle past its opposite corner does not invert the shape: it
 * stops at the minimum size. Flipping under the cursor is disorienting, and a
 * negative width elsewhere in the app means "no answer" rather than "mirrored".
 */
export function resizeBox(
  start: Box,
  handle: ResizeHandle,
  pointer: Point,
  options: ResizeOptions = {},
): Box {
  const axes = axesFor(handle)
  const local = toLocal(start, pointer);

  // Half extents of the box that was grabbed.
  const hw0 = start.width / 2
  const hh0 = start.height / 2

  // The edge opposite the one being dragged stays put, in local coordinates.
  const anchorX = axes.x === 0 ? 0 : -axes.x * hw0
  const anchorY = axes.y === 0 ? 0 : -axes.y * hh0

  let width = start.width
  let height = start.height

  if (axes.x !== 0) width = clamp(Math.abs(local.x - anchorX), MIN_SIZE_IN, MAX_SIZE_IN)
  if (axes.y !== 0) height = clamp(Math.abs(local.y - anchorY), MIN_SIZE_IN, MAX_SIZE_IN)

  if (options.preserveRatio) {
    const ratio = start.width / start.height
    if (axes.x !== 0 && axes.y !== 0) {
      // A corner: let the axis that moved furthest lead, so the shape follows
      // the cursor rather than lagging on whichever axis happens to be smaller.
      if (Math.abs(width - start.width) >= Math.abs(height - start.height)) {
        height = clamp(width / ratio, MIN_SIZE_IN, MAX_SIZE_IN)
        width = clamp(height * ratio, MIN_SIZE_IN, MAX_SIZE_IN)
      } else {
        width = clamp(height * ratio, MIN_SIZE_IN, MAX_SIZE_IN)
        height = clamp(width / ratio, MIN_SIZE_IN, MAX_SIZE_IN)
      }
    } else if (axes.x !== 0) {
      height = clamp(width / ratio, MIN_SIZE_IN, MAX_SIZE_IN)
      width = clamp(height * ratio, MIN_SIZE_IN, MAX_SIZE_IN)
    } else {
      width = clamp(height * ratio, MIN_SIZE_IN, MAX_SIZE_IN)
      height = clamp(width / ratio, MIN_SIZE_IN, MAX_SIZE_IN)
    }
  }

  // Rebuild about the anchor, in local space, then carry the centre back out.
  const localCentre = {
    x: axes.x === 0 ? 0 : anchorX + axes.x * (width / 2),
    y: axes.y === 0 ? 0 : anchorY + axes.y * (height / 2),
  }
  const worldCentre = toWorld(start, localCentre)

  return {
    x: worldCentre.x - width / 2,
    y: worldCentre.y - height / 2,
    width,
    height,
    rotation: start.rotation,
  }
}

/**
 * The angle the shape should take, from where the pointer is.
 *
 * `grabOffset` is the angle between the grip and the pointer when the drag
 * began, so the shape does not jump to meet the cursor on the first frame.
 */
export function rotationFrom(
  start: Box,
  pointer: Point,
  grabOffsetDeg: number,
  snap = false,
): number {
  const c = centreOf(start)
  const dx = pointer.x - c.x
  const dy = pointer.y - c.y
  if (dx === 0 && dy === 0) return start.rotation

  // Measured from straight up, because the grip sits above the shape.
  const pointing = (Math.atan2(dx, -dy) * 180) / Math.PI
  const raw = pointing - grabOffsetDeg
  const snapped = snap ? Math.round(raw / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG : raw
  return normalizeDegrees(snapped)
}

/** The angle between the rotate grip and the pointer at the moment of grabbing. */
export function grabOffsetFor(start: Box, pointer: Point): number {
  const c = centreOf(start)
  const pointing = (Math.atan2(pointer.x - c.x, -(pointer.y - c.y)) * 180) / Math.PI
  return pointing - start.rotation
}

/** Always in [0, 360), so an inspector never shows a negative or a 720. */
export function normalizeDegrees(deg: number): number {
  const wrapped = deg % 360
  return wrapped < 0 ? wrapped + 360 : wrapped
}
