// DesignIntent to editor shapes.
//
// This is the last deterministic step before geometry becomes something a
// builder can price. It refuses rather than guesses: an intent with no resolved
// scale produces zero shapes and a warning, because the alternative is a pool
// that looks right and measures wrong.
//
// Units: `DesignIntent` footprints are already intent-frame INCHES (the pipeline
// divides pixels by `pixelsPerInch` before the intent is built), and editor
// state stores inches at 1 canvas unit = 1 inch, so footprints pass through
// unscaled. Only the `*Ft` fields are converted, at 12 inches to the foot.

import {
  hasResolvedScale,
  type DeckMaterial,
  type DesignIntent,
  type FeatureIntent,
  type Footprint,
  type Point,
} from '../intent'
import {
  ShapeKind,
  SHAPE_DEFAULTS,
  type DisplayHint,
  type PolygonPool,
  type Shape,
  type ShapeBase,
} from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { boundsOf, closeRing } from './simplify'

const INCHES_PER_FOOT = 12
const DEFAULT_DEPTH_SHALLOW_FT = 3
const DEFAULT_DEPTH_DEEP_FT = 5

/**
 * Re-exported so callers written against this module keep one import. I0's
 * `PolygonPool` is already a member of the `Shape` union, so a translated
 * shape is just a `Shape`.
 */
export type PolygonPoolShape = PolygonPool

export type TranslatedShape = Shape

export interface TranslateResult {
  shapes: TranslatedShape[]
  warnings: string[]
}

export interface TranslateOptions {
  /** Where the assembly's top-left corner lands, in canvas inches. */
  originInches: Point
  /** Ids are deterministic by default so translation stays a pure function. */
  idFactory: (kind: string, ordinal: number) => string
}

export const TRANSLATE_DEFAULTS: TranslateOptions = {
  originInches: { x: 0, y: 0 },
  idFactory: (kind, ordinal) => `import-${kind.toLowerCase()}-${ordinal}`,
}

function resolveOptions(options: Partial<TranslateOptions>): TranslateOptions {
  return {
    originInches: options.originInches ?? TRANSLATE_DEFAULTS.originInches,
    idFactory: options.idFactory ?? TRANSLATE_DEFAULTS.idFactory,
  }
}

interface Draft {
  shape: TranslatedShape
  /** Bounds in intent-frame inches, before the assembly is moved to the origin. */
  frame: { x: number; y: number }
}

/**
 * Translate a `DesignIntent` into editor shapes.
 *
 * The pool is emitted first and carries the lowest `zIndex`, so a deck or a
 * feature drawn afterwards never disappears underneath it.
 */
export function intentToShapes(
  intent: DesignIntent,
  options: Partial<TranslateOptions> = {},
): TranslateResult {
  const opts = resolveOptions(options)
  const warnings: string[] = []

  if (!hasResolvedScale(intent)) {
    return {
      shapes: [],
      warnings: [
        'scale is unresolved (pixelsPerInch is null), so no geometry was produced; ' +
          'calibrate the image before applying',
      ],
    }
  }

  const drafts: Draft[] = []
  let ordinal = 0
  const nextId = (kind: string): string => opts.idFactory(kind, ++ordinal)

  addPool(intent, drafts, warnings, nextId)
  addDeck(intent, drafts, warnings, nextId)
  addFeatures(intent, drafts, warnings, nextId)
  addEnclosure(intent, drafts, warnings, nextId)
  noteDroppedSite(intent, warnings)

  if (drafts.length === 0) {
    warnings.push('the intent carried no geometry that maps onto an editor shape')
    return { shapes: [], warnings }
  }

  // One translation for the whole assembly, so the relative layout the model
  // saw survives intact. Moving shapes independently would scatter them.
  let minX = Infinity
  let minY = Infinity
  for (const draft of drafts) {
    if (draft.frame.x < minX) minX = draft.frame.x
    if (draft.frame.y < minY) minY = draft.frame.y
  }
  const dx = opts.originInches.x - minX
  const dy = opts.originInches.y - minY

  const shapes = drafts.map((draft, index) => {
    const shape = draft.shape
    shape.x = draft.frame.x + dx
    shape.y = draft.frame.y + dy
    shape.zIndex = index
    return shape
  })

  return { shapes, warnings }
}

function baseShape(id: string, width: number, height: number): Omit<ShapeBase, 'kind'> {
  return {
    id,
    x: 0,
    y: 0,
    width,
    height,
    rotation: 0,
    zIndex: 0,
    locked: false,
    hidden: false,
  }
}

function footprintRing(footprint: Footprint): Point[] {
  return closeRing(footprint.points)
}

function feetToInches(value: number | null, fallback: number | null): number | null {
  if (value !== null && Number.isFinite(value) && value > 0) return value * INCHES_PER_FOOT
  if (fallback !== null) return fallback * INCHES_PER_FOOT
  return null
}

function addPool(
  intent: DesignIntent,
  drafts: Draft[],
  warnings: string[],
  nextId: (kind: string) => string,
): void {
  const depthShallow = intent.pool.depthShallowFt ?? DEFAULT_DEPTH_SHALLOW_FT
  const depthDeep = intent.pool.depthDeepFt ?? DEFAULT_DEPTH_DEEP_FT
  if (intent.pool.depthShallowFt === null || intent.pool.depthDeepFt === null) {
    warnings.push(
      `pool depths were not read from the image; defaulted to ${DEFAULT_DEPTH_SHALLOW_FT}ft ` +
        `shallow and ${DEFAULT_DEPTH_DEEP_FT}ft deep, which drives gallons and wetted area`,
    )
  }

  if (intent.pool.footprint) {
    const ring = footprintRing(intent.pool.footprint)
    if (ring.length >= 3) {
      const bounds = boundsOf(ring)
      const shape: PolygonPool = {
        ...baseShape(nextId('POLYGON_POOL'), bounds.width, bounds.height),
        kind: ShapeKind.POLYGON_POOL,
        points: ring.map((p) => ({ x: p.x - bounds.minX, y: p.y - bounds.minY })),
        depthShallow,
        depthDeep,
      }
      drafts.push({ shape, frame: { x: bounds.minX, y: bounds.minY } })
      return
    }
    warnings.push(
      'the pool footprint collapsed to fewer than 3 distinct vertices and was discarded',
    )
  }

  const width = feetToInches(intent.pool.lengthFt, null)
  const height = feetToInches(intent.pool.widthFt, null)
  if (width === null || height === null) {
    warnings.push('no pool footprint and no length/width were read, so no pool shape was created')
    return
  }

  const shape: Shape = {
    ...baseShape(nextId('RECTANGLE_POOL'), width, height),
    kind: ShapeKind.RECTANGLE_POOL,
    depthShallow,
    depthDeep,
  }
  if (intent.pool.shapeFamily === 'oval') {
    const hint: DisplayHint = { poolShape: 'ellipse' }
    shape.displayHint = hint
  } else if (intent.pool.shapeFamily !== 'rectangle' && intent.pool.shapeFamily !== 'unknown') {
    warnings.push(
      `pool shape family "${intent.pool.shapeFamily}" has no footprint, so it was approximated ` +
        'as a rectangle from the read dimensions',
    )
  }
  drafts.push({ shape, frame: { x: 0, y: 0 } })
}

type DeckKind =
  | typeof ShapeKind.CONCRETE_DECK
  | typeof ShapeKind.PAVER_DECK
  | typeof ShapeKind.GRASS_AREA

type FeatureKind = typeof ShapeKind.SUN_SHELF | typeof ShapeKind.BENCH | typeof ShapeKind.SPA

const FEATURE_KINDS: readonly ShapeKind[] = [ShapeKind.SUN_SHELF, ShapeKind.BENCH, ShapeKind.SPA]

function isFeatureKind(kind: ShapeKind): kind is FeatureKind {
  return FEATURE_KINDS.includes(kind)
}

// Travertine has no kind of its own; it prices as a paver deck, which is the
// closest the price book has.
const DECK_KIND_BY_MATERIAL: Partial<Record<DeckMaterial, DeckKind>> = {
  concrete: ShapeKind.CONCRETE_DECK,
  paver: ShapeKind.PAVER_DECK,
  travertine: ShapeKind.PAVER_DECK,
  grass: ShapeKind.GRASS_AREA,
}

function addDeck(
  intent: DesignIntent,
  drafts: Draft[],
  warnings: string[],
  nextId: (kind: string) => string,
): void {
  if (!intent.deck.footprint) return
  const ring = footprintRing(intent.deck.footprint)
  if (ring.length < 3) {
    warnings.push('the deck footprint collapsed to fewer than 3 distinct vertices and was discarded')
    return
  }

  const mapped = DECK_KIND_BY_MATERIAL[intent.deck.material]
  if (!mapped) {
    warnings.push('the deck material was not identified; defaulted to concrete for pricing')
  }
  const kind: DeckKind = mapped ?? ShapeKind.CONCRETE_DECK

  const bounds = boundsOf(ring)
  if (!isRectangular(ring)) {
    warnings.push(
      'the deck footprint is not rectangular; it was approximated by its bounding box, ' +
        'which over-counts deck area on a concave outline',
    )
  }

  const shape: Shape = {
    ...baseShape(nextId(kind), bounds.width, bounds.height),
    kind,
  }
  drafts.push({ shape, frame: { x: bounds.minX, y: bounds.minY } })
}

function isRectangular(ring: readonly Point[]): boolean {
  if (ring.length !== 4) return false
  const bounds = boundsOf(ring)
  const tolerance = Math.max(1e-6, Math.max(bounds.width, bounds.height) * 1e-3)
  return ring.every(
    (p) =>
      (Math.abs(p.x - bounds.minX) <= tolerance || Math.abs(p.x - bounds.maxX) <= tolerance) &&
      (Math.abs(p.y - bounds.minY) <= tolerance || Math.abs(p.y - bounds.maxY) <= tolerance),
  )
}

/**
 * Feature `x` / `y` in the intent are read as the CENTRE of the feature. The
 * contract does not say which corner they mean, and a model asked to locate a
 * spa points at the thing rather than at its top-left corner, so the centre is
 * the reading that stays right when the size estimate is wrong.
 */
function addFeatures(
  intent: DesignIntent,
  drafts: Draft[],
  warnings: string[],
  nextId: (kind: string) => string,
): void {
  intent.features.forEach((feature, index) => {
    const resolved = resolveFeatureKind(feature)
    if (!resolved) {
      warnings.push(
        `feature "${feature.label}" did not match a stencil and was skipped; ` +
          'add it by hand if it belongs in the quote',
      )
      return
    }

    const size = featureSize(feature, resolved.stencilId)
    for (let copy = 0; copy < feature.count; copy++) {
      const id = nextId(resolved.kind)
      const offsetX = copy * size.width * 1.25
      const centreX = feature.x !== null ? feature.x : index * size.width * 1.5
      const centreY = feature.y !== null ? feature.y : 0
      const frame = {
        x: centreX - size.width / 2 + offsetX,
        y: centreY - size.height / 2,
      }

      const named = { ...baseShape(id, size.width, size.height), name: feature.label }
      // Anything that is not one of the three dedicated feature kinds becomes a
      // generic stencil. A pool-shape stencil listed as a feature would
      // otherwise be emitted as a pool kind with no depths on it.
      const shape: TranslatedShape = isFeatureKind(resolved.kind)
        ? { ...named, kind: resolved.kind }
        : { ...named, kind: ShapeKind.STENCIL, stencilId: resolved.stencilId }
      drafts.push({ shape, frame })
    }

    if (feature.x === null || feature.y === null) {
      warnings.push(
        `feature "${feature.label}" had no position in the image and was laid out beside the pool`,
      )
    }
  })
}

function resolveFeatureKind(
  feature: FeatureIntent,
): { kind: ShapeKind; stencilId: string } | null {
  if (feature.stencilId) {
    const stencil = getStencil(feature.stencilId)
    if (stencil) return { kind: stencil.shapeKind, stencilId: stencil.id }
    return null
  }
  const label = feature.label.trim().toLowerCase()
  if (label.length === 0) return null
  const match = LABEL_FALLBACKS.find(([needle]) => label.includes(needle))
  if (!match) return null
  const stencil = getStencil(match[1])
  if (!stencil) return null
  return { kind: stencil.shapeKind, stencilId: stencil.id }
}

// Only the handful of labels a builder actually writes on a sketch. A wider
// fuzzy match would mislabel more often than it helps, and an unmatched feature
// surfaces as a warning the reviewer can act on.
const LABEL_FALLBACKS: readonly (readonly [string, string])[] = [
  ['sun shelf', 'feature.sun-shelf'],
  ['tanning', 'feature.tanning-ledge'],
  ['sun deck', 'feature.sun-shelf'],
  ['baja', 'feature.sun-shelf'],
  ['bench', 'feature.bench'],
  ['spa', 'pool.spa'],
  ['hot tub', 'pool.spa'],
  ['bubbler', 'feature.bubblers'],
  ['deck jet', 'feature.deck-jets'],
  ['umbrella', 'feature.umbrella-hole'],
  ['main drain', 'feature.main-drain'],
  ['light', 'feature.light'],
]

function featureSize(feature: FeatureIntent, stencilId: string): { width: number; height: number } {
  const stencil = getStencil(stencilId)
  let width: number
  let height: number
  if (stencil) {
    const factor = stencil.defaultDimensions.unit === 'ft' ? INCHES_PER_FOOT : 1
    width = stencil.defaultDimensions.width * factor
    height = stencil.defaultDimensions.height * factor
  } else {
    const fallback = SHAPE_DEFAULTS[ShapeKind.STENCIL]
    width = fallback.width
    height = fallback.height
  }
  const readWidth = feetToInches(feature.lengthFt, null)
  const readHeight = feetToInches(feature.widthFt, null)
  return { width: readWidth ?? width, height: readHeight ?? height }
}

const ENCLOSURE_STENCILS: Record<string, string> = {
  screen: 'deck.screen-cage',
  lanai: 'deck.lanai',
}

function addEnclosure(
  intent: DesignIntent,
  drafts: Draft[],
  warnings: string[],
  nextId: (kind: string) => string,
): void {
  if (!intent.enclosure.present || intent.enclosure.kind === 'none') return
  const stencilId = ENCLOSURE_STENCILS[intent.enclosure.kind]
  if (!stencilId) return
  if (!intent.enclosure.footprint) {
    warnings.push(
      `a ${intent.enclosure.kind} enclosure was detected but its outline was not, ` +
        'so no enclosure shape was created',
    )
    return
  }
  const ring = footprintRing(intent.enclosure.footprint)
  if (ring.length < 3) {
    warnings.push('the enclosure footprint collapsed to fewer than 3 distinct vertices')
    return
  }
  const bounds = boundsOf(ring)
  const shape: Shape = {
    ...baseShape(nextId('STENCIL'), bounds.width, bounds.height),
    kind: ShapeKind.STENCIL,
    stencilId,
  }
  drafts.push({ shape, frame: { x: bounds.minX, y: bounds.minY } })
}

function noteDroppedSite(intent: DesignIntent, warnings: string[]): void {
  const dropped: string[] = []
  if (intent.site.propertyBoundary) dropped.push('property boundary')
  if (intent.site.houseFootprint) dropped.push('house footprint')
  if (dropped.length > 0) {
    warnings.push(
      `${dropped.join(' and ')} were extracted but there is no editor primitive for them yet; ` +
        'they were not applied',
    )
  }
}
