// Dragging a stencil card onto the canvas.
//
// One MIME type, one payload shape, shared by the card that starts the drag
// and the canvas that catches it. The catalogue and the builder's own library
// drag the same way and differ only in `source`, which decides whether the
// drop dispatches `add.shape` or `stencil.library.place`.
//
// Files are not this. A file dragged from the desktop carries the `Files`
// type and is the Stencils panel's business (a Visio import), never the
// canvas's, and `hasStencilDrag` says no to it.

import type { LibraryCommand } from '@/modules/imports/visio/types'

export const STENCIL_DRAG_MIME = 'application/x-poolforge-stencil'

export const StencilDragSource = {
  /** A built-in stencil; `id` is the catalogue id, e.g. `pool.rectangle`. */
  CATALOG: 'catalog',
  /** An `OrgStencil` row; `id` is its cuid. */
  LIBRARY: 'library',
} as const
export type StencilDragSource = (typeof StencilDragSource)[keyof typeof StencilDragSource]

export interface StencilDragPayload {
  source: StencilDragSource
  id: string
  /** Real inches, so the drop can centre the stencil under the pointer without asking the server first. */
  widthIn: number
  heightIn: number
}

/** The command a drop of this source dispatches. */
export const DROP_COMMAND: Record<StencilDragSource, 'add.shape' | typeof LibraryCommand.PLACE> = {
  catalog: 'add.shape',
  library: 'stencil.library.place',
}

interface DataTransferLike {
  types: readonly string[] | DOMStringList
  getData: (format: string) => string
  setData: (format: string, data: string) => void
  effectAllowed?: string
  dropEffect?: string
}

/** True when a drag carries a stencil, whatever else it carries. */
export function hasStencilDrag(types: readonly string[] | DOMStringList | undefined): boolean {
  if (!types) return false
  return Array.from(types as ArrayLike<string>).includes(STENCIL_DRAG_MIME)
}

/** Writes the payload for `dragstart`. */
export function encodeStencilDrag(dt: DataTransferLike, payload: StencilDragPayload): void {
  dt.setData(STENCIL_DRAG_MIME, JSON.stringify(payload))
  // Belt and braces: a drop target that only reads text still gets the name of
  // what was dragged rather than nothing.
  dt.setData('text/plain', `${payload.source}:${payload.id}`)
  dt.effectAllowed = 'copy'
}

function isSource(value: unknown): value is StencilDragSource {
  return value === StencilDragSource.CATALOG || value === StencilDragSource.LIBRARY
}

/** Reads the payload on `drop`. Null for anything that is not a well-formed stencil drag. */
export function decodeStencilDrag(dt: DataTransferLike | null | undefined): StencilDragPayload | null {
  if (!dt || !hasStencilDrag(dt.types)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(dt.getData(STENCIL_DRAG_MIME))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const { source, id, widthIn, heightIn } = parsed as Record<string, unknown>
  if (!isSource(source)) return null
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof widthIn !== 'number' || !Number.isFinite(widthIn) || widthIn <= 0) return null
  if (typeof heightIn !== 'number' || !Number.isFinite(heightIn) || heightIn <= 0) return null
  return { source, id, widthIn, heightIn }
}

/**
 * Where the shape's top-left goes so that its centre is under the pointer.
 *
 * Shapes store their top-left; a person dropping something is pointing at its
 * middle. Rounded to whole inches so a dropped pool does not sit at 143.72.
 */
export function dropTopLeft(
  center: { x: number; y: number },
  widthIn: number,
  heightIn: number,
): { x: number; y: number } {
  return {
    x: Math.round(center.x - widthIn / 2),
    y: Math.round(center.y - heightIn / 2),
  }
}
