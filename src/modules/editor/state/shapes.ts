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
  // The concrete border and the waterline tile are part of the pool's own mesh
  // rather than separate objects, so they have no id and cannot be deleted.
  // Absent means present, because a real pool has both.
  coping?: boolean
  tileBand?: boolean
  /**
   * Zoning limits, carried by the property line the user drew.
   *
   * Only meaningful on a `symbol.property-line` shape, and absent until a
   * builder has actually looked the numbers up: the site plan prints "not
   * entered" rather than a default, because a default here is a number a plan
   * checker would hold the builder to.
   */
  lot?: {
    frontFt?: number
    sideFt?: number
    rearFt?: number
    easements?: string
  }
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
  /**
   * Height above the ground beneath it, in feet.
   *
   * Absent means sitting on grade, which is what almost everything does. A
   * raised deck, a sunken patio or a spa spilling into a pool is this field:
   * before it existed they all rendered at the same height as the lawn.
   */
  elevationFt?: number
  /**
   * The finish chosen for each pool surface, as `Material` ids.
   *
   * Saved with the drawing, so it survives a reload, and resolved against the
   * price book by `@/modules/materials/catalog` so the same choice drives the
   * quote and prints on the proposal and the construction packet.
   *
   * There used to be a fourth key here called `surface`, written by
   * `set.shape.material` and read by nothing at all. Three slots, because a
   * pool has three finished surfaces and each is billed in its own unit.
   */
  materials?: { interior?: string; coping?: string; tileBand?: string }
}

export interface RectanglePool extends ShapeBase {
  kind: typeof ShapeKind.RECTANGLE_POOL
  depthShallow: number
  depthDeep: number
}

// Freeform footprint pool. `points` are in inches, relative to the shape
// origin (x, y), so translating the shape never rewrites the ring. `width` and
// `height` on ShapeBase stay the ring's bounding box, which keeps selection,
// drag, and the inspector working unchanged.
export interface PolygonPool extends ShapeBase {
  kind: typeof ShapeKind.POLYGON_POOL
  points: { x: number; y: number }[]
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

/**
 * A line, arc or freehand outline drawn in plan.
 *
 * The primitive a 2D-first designer actually starts from: the house, the lot
 * line, a deck edge, the pool outline, drawn before any of it is a priced
 * object yet. `points` are inches relative to the shape origin, matching
 * `PolygonPool`, so the same translate and bounding-box code serves both and a
 * closed sketch can become a pool without moving a single vertex.
 *
 * `closed` is stored rather than inferred from the first and last point being
 * equal. A closed ring and an open path that happens to end where it started
 * are different intentions, and only the first has an area worth pricing.
 */
export interface SketchPath extends ShapeBase {
  kind: typeof ShapeKind.SKETCH_PATH
  points: { x: number; y: number }[]
  closed: boolean
  /** What the drawer called it: "House", "Lot line", "Deck edge". */
  labelText?: string
  /**
   * Flat plan-view fill for a closed outline. A spectrum hue name, never a hex:
   * only blue, green, orange and purple are offered here, since red and amber
   * already mean error and warning and a fill in either would read as a
   * problem with the drawing rather than a colour choice about it.
   */
  fillColor?: 'blue' | 'green' | 'orange' | 'purple'
}

// Generic shape backed by an entry in the StencilDef catalog. Display +
// measurement behavior are derived via stencilId from the catalog entry.
export interface StencilShape extends ShapeBase {
  kind: typeof ShapeKind.STENCIL
  stencilId: string
}

export type Shape = RectanglePool | PolygonPool | DeckShape | FeatureShape | StencilShape | SketchPath

export function isSketchPath(shape: Shape): shape is SketchPath {
  return shape.kind === ShapeKind.SKETCH_PATH
}

export function isPool(shape: Shape): shape is RectanglePool {
  return shape.kind === ShapeKind.RECTANGLE_POOL
}

export function isPolygonPool(shape: Shape): shape is PolygonPool {
  return shape.kind === ShapeKind.POLYGON_POOL
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
  [ShapeKind.POLYGON_POOL]: { width: 25 * 12, height: 12 * 12, label: 'Freeform Pool' },
  // A sketch is sized by what was drawn, so the default is only what a zero
  // length path falls back to rather than a shape anybody places at this size.
  [ShapeKind.SKETCH_PATH]: { width: 10 * 12, height: 10 * 12, label: 'Sketch' },
  [ShapeKind.CONCRETE_DECK]: { width: 35 * 12, height: 22 * 12, label: 'Concrete Deck' },
  [ShapeKind.PAVER_DECK]: { width: 35 * 12, height: 22 * 12, label: 'Paver Deck' },
  [ShapeKind.GRASS_AREA]: { width: 20 * 12, height: 20 * 12, label: 'Grass Area' },
  [ShapeKind.SUN_SHELF]: { width: 8 * 12, height: 4 * 12, label: 'Sun Shelf' },
  [ShapeKind.BENCH]: { width: 8 * 12, height: 1.5 * 12, label: 'Bench' },
  [ShapeKind.SPA]: { width: 7 * 12, height: 7 * 12, label: 'Spa' },
  [ShapeKind.STENCIL]: { width: 36, height: 36, label: 'Stencil' },
}
