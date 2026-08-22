import type { Shape } from './state/shapes'
import { ShapeKind } from './state/shapes'
import { getStencil } from './stencils'

// Where an object lands when it is added from the panel rather than pointed at.
//
// Two things were wrong with the previous rule. It anchored to
// `ShapeKind.RECTANGLE_POOL` alone, so a Grecian or a pool-and-spa left every
// later object stranded at the origin on top of each other. And it staggered a
// fixed 36 inches per object in one direction, so thirty-six objects ran about
// ninety-six feet down the sheet in a single column.
//
// This stages them in a block beside whatever is already drawn: findable,
// selectable, and all on screen at once. It is still not drag-to-place, which is
// what this really wants, but it is a staging area rather than a queue.

/** Inches of clear space between the drawing and the staging block. */
const MARGIN = 48

/** Inches between staged objects. */
const GAP = 24

/** How many objects go down a column before a new column starts. */
const PER_COLUMN = 5

/** Smallest cell, so tiny symbols do not overlap their neighbours' labels. */
const MIN_CELL = 48

export interface Placement {
  x: number
  y: number
}

/** Bounding box of everything visible, or null on an empty canvas. */
export function visibleBounds(
  shapes: Shape[],
): { x: number; y: number; width: number; height: number } | null {
  const visible = shapes.filter(shape => !shape.hidden)
  const first = visible[0]
  if (!first) return null

  let minX = first.x
  let minY = first.y
  let maxX = first.x + first.width
  let maxY = first.y + first.height

  for (const shape of visible) {
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Where to put the next object added from the stencil panel.
 *
 * `staged` is how many are already in the block, which decides the slot. The
 * caller passes it rather than this counting, because what counts as staged is
 * the caller's business: everything dropped from the panel, not everything on
 * the canvas.
 */
export function stagingPlacement(shapes: Shape[], stencilId: string, staged: number): Placement {
  const bounds = visibleBounds(shapes)
  const originX = bounds ? bounds.x + bounds.width + MARGIN : 0
  const originY = bounds ? bounds.y : 0

  const stencil = getStencil(stencilId)
  const factor = stencil?.defaultDimensions.unit === 'ft' ? 12 : 1
  const cell = Math.max(
    MIN_CELL,
    (stencil?.defaultDimensions.width ?? MIN_CELL) * factor,
    (stencil?.defaultDimensions.height ?? MIN_CELL) * factor,
  )

  const column = Math.floor(staged / PER_COLUMN)
  const row = staged % PER_COLUMN

  return {
    x: originX + column * (cell + GAP),
    y: originY + row * (cell + GAP),
  }
}

/** Objects already sitting in the staging block. */
export function stagedCount(shapes: Shape[]): number {
  return shapes.filter(shape => shape.kind === ShapeKind.STENCIL && !shape.hidden).length
}
