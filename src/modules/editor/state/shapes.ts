// Internal unit convention: 1 canvas unit = 1 inch.
// All dimensions stored in inches; geometry helpers convert to feet/sqft.

import { ShapeKind } from '@prisma/client'

export { ShapeKind }

export interface DisplayHint {
  flippedX?: boolean
  flippedY?: boolean
  lockedRatio?: boolean
  text?: string
  // Pool footprint shape. Absent or 'rectangle' = the default box footprint;
  // 'ellipse' measures and renders the pool as an oval within its bounding box.
  poolShape?: 'rectangle' | 'ellipse'
}

export interface ShapeBase {
  id: string
  kind: ShapeKind
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
  locked: boolean
  hidden: boolean
  name?: string
  displayHint?: DisplayHint
}

export interface RectanglePool extends ShapeBase {
  kind: typeof ShapeKind.RECTANGLE_POOL
  depthShallow: number
  depthDeep: number
}

export interface DeckShape extends ShapeBase {
  kind:
    | typeof ShapeKind.CONCRETE_DECK
    | typeof ShapeKind.PAVER_DECK
    | typeof ShapeKind.GRASS_AREA
}

export interface FeatureShape extends ShapeBase {
  kind:
    | typeof ShapeKind.SUN_SHELF
    | typeof ShapeKind.BENCH
    | typeof ShapeKind.SPA
}

// Generic shape backed by an entry in the StencilDef catalog. Display +
// measurement behavior are derived via stencilId from the catalog entry.
export interface StencilShape extends ShapeBase {
  kind: typeof ShapeKind.STENCIL
  stencilId: string
}

export type Shape = RectanglePool | DeckShape | FeatureShape | StencilShape

export function isPool(shape: Shape): shape is RectanglePool {
  return shape.kind === ShapeKind.RECTANGLE_POOL
}

export function isDeck(shape: Shape): shape is DeckShape {
  return (
    shape.kind === ShapeKind.CONCRETE_DECK ||
    shape.kind === ShapeKind.PAVER_DECK ||
    shape.kind === ShapeKind.GRASS_AREA
  )
}

export function isFeature(shape: Shape): shape is FeatureShape {
  return (
    shape.kind === ShapeKind.SUN_SHELF ||
    shape.kind === ShapeKind.BENCH ||
    shape.kind === ShapeKind.SPA
  )
}

export function isStencil(shape: Shape): shape is StencilShape {
  return shape.kind === ShapeKind.STENCIL
}

// No-op kept for callsites that previously coerced from Prisma → local kind.
// Both layers now use the same Prisma enum so this is identity.
export function shapeKindFromPrisma(k: ShapeKind): ShapeKind {
  return k
}

export const SHAPE_DEFAULTS: Record<ShapeKind, { width: number; height: number; label: string }> = {
  [ShapeKind.RECTANGLE_POOL]: { width: 25 * 12, height: 12 * 12, label: 'Rectangle Pool' },
  [ShapeKind.CONCRETE_DECK]: { width: 35 * 12, height: 22 * 12, label: 'Concrete Deck' },
  [ShapeKind.PAVER_DECK]: { width: 35 * 12, height: 22 * 12, label: 'Paver Deck' },
  [ShapeKind.GRASS_AREA]: { width: 20 * 12, height: 20 * 12, label: 'Grass Area' },
  [ShapeKind.SUN_SHELF]: { width: 8 * 12, height: 4 * 12, label: 'Sun Shelf' },
  [ShapeKind.BENCH]: { width: 8 * 12, height: 1.5 * 12, label: 'Bench' },
  [ShapeKind.SPA]: { width: 7 * 12, height: 7 * 12, label: 'Spa' },
  [ShapeKind.STENCIL]: { width: 36, height: 36, label: 'Stencil' },
}
