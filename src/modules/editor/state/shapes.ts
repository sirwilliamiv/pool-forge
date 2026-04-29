// Internal unit convention: 1 canvas unit = 1 inch.
// All dimensions stored in inches; geometry helpers convert to feet/sqft.

export type ShapeKind =
  | 'rectangle-pool'
  | 'concrete-deck'
  | 'paver-deck'
  | 'grass-area'
  | 'sun-shelf'
  | 'bench'
  | 'spa'

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
}

export interface RectanglePool extends ShapeBase {
  kind: 'rectangle-pool'
  depthShallow: number
  depthDeep: number
}

export interface DeckShape extends ShapeBase {
  kind: 'concrete-deck' | 'paver-deck' | 'grass-area'
}

export interface FeatureShape extends ShapeBase {
  kind: 'sun-shelf' | 'bench' | 'spa'
}

export type Shape = RectanglePool | DeckShape | FeatureShape

export function isPool(shape: Shape): shape is RectanglePool {
  return shape.kind === 'rectangle-pool'
}

export function isDeck(shape: Shape): shape is DeckShape {
  return shape.kind === 'concrete-deck' || shape.kind === 'paver-deck' || shape.kind === 'grass-area'
}

export function isFeature(shape: Shape): shape is FeatureShape {
  return shape.kind === 'sun-shelf' || shape.kind === 'bench' || shape.kind === 'spa'
}

export const SHAPE_DEFAULTS: Record<ShapeKind, { width: number; height: number; label: string }> = {
  'rectangle-pool': { width: 25 * 12, height: 12 * 12, label: 'Rectangle Pool' },
  'concrete-deck': { width: 35 * 12, height: 22 * 12, label: 'Concrete Deck' },
  'paver-deck': { width: 35 * 12, height: 22 * 12, label: 'Paver Deck' },
  'grass-area': { width: 20 * 12, height: 20 * 12, label: 'Grass Area' },
  'sun-shelf': { width: 8 * 12, height: 4 * 12, label: 'Sun Shelf' },
  'bench': { width: 8 * 12, height: 1.5 * 12, label: 'Bench' },
  'spa': { width: 7 * 12, height: 7 * 12, label: 'Spa' },
}
