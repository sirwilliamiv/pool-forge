import { PriceCategory, ShapeKind } from '@prisma/client'
import {
  isDeck,
  isFeature,
  isPolygonPool,
  isPool,
  isStencil,
  type Shape,
} from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { quoteCategoryForStencil } from '@/modules/editor/stencils/quote-category'
import { cutFillBetween, maxSlope, type Bounds, type SiteGrade } from '@/modules/editor/grade/model'
import { MeasurementBehavior } from '@/modules/editor/stencils/types'
import {
  poolGallons,
  rectangleAreaSqft,
  rectanglePerimeterLf,
  wettedAreaSqft,
} from '@/lib/geometry/rectangle'
import { ellipseAreaSqft, ellipsePerimeterLf } from '@/lib/geometry/ellipse'
import {
  polygonArea,
  polygonBounds,
  polygonPerimeter,
} from '@/lib/geometry/polygon-footprint'

export interface MeasurementSummary {
  poolSurfaceArea: number
  poolPerimeter: number
  poolGallons: number
  poolWettedArea: number
  poolLengthFt: number
  poolWidthFt: number
  poolDepthShallow: number
  poolDepthDeep: number
  poolAvgDepth: number
  deckArea: number
  copingLinearFeet: number
  decoDrainLinearFeet: number
  benchLinearFeet: number
  featureCount: number
  spaCount: number
  /**
   * Lighting fixtures actually placed in the drawing.
   *
   * Kept apart from `featureCount` because lighting is a priced category and a
   * generic feature is not: a light the designer placed used to price at zero
   * unless someone also typed a number into the project form.
   */
  lightCount: number
  /** Water / fire features placed in the drawing, for the same reason. */
  waterFeatureCount: number
  hasPool: boolean
  hasDeck: boolean
  /**
   * Earthwork, in cubic yards.
   *
   * Cut and fill are kept apart rather than netted: a yard out is haulage and a
   * yard in is material, so a site that balances on paper still bills for both.
   * Zero on a flat site, which is what every drawing made before grading
   * existed reports.
   */
  cutYards: number
  fillYards: number
  /** Steepest fall on the site, as a percentage. */
  maxSlopePct: number
}

const EMPTY_SUMMARY: MeasurementSummary = {
  cutYards: 0,
  fillYards: 0,
  maxSlopePct: 0,
  poolSurfaceArea: 0,
  poolPerimeter: 0,
  poolGallons: 0,
  poolWettedArea: 0,
  poolLengthFt: 0,
  poolWidthFt: 0,
  poolDepthShallow: 0,
  poolDepthDeep: 0,
  poolAvgDepth: 0,
  deckArea: 0,
  copingLinearFeet: 0,
  decoDrainLinearFeet: 0,
  benchLinearFeet: 0,
  featureCount: 0,
  spaCount: 0,
  lightCount: 0,
  waterFeatureCount: 0,
  hasPool: false,
  hasDeck: false,
}

// Setback envelope: spec §8.3 — 7'6" rear, 5' side. Encoded in inches.
const REAR_SETBACK_IN = 7.5 * 12
const SIDE_SETBACK_IN = 5 * 12
// Default house wall position when no HOUSE_WALL shape is in the scene:
// 28 ft north of origin (matches site-context placement). Inches.
const DEFAULT_HOUSE_Y_IN = -28 * 12
// Lot bounds (inches). Used as the setback reference rectangle.
const LOT_HALF_WIDTH_IN = 50 * 12
const LOT_REAR_IN = 60 * 12
const LOT_FRONT_IN = -40 * 12

function shapeCenter(shape: Shape): { cx: number; cy: number } {
  return { cx: shape.x + shape.width / 2, cy: shape.y + shape.height / 2 }
}

function formatFtIn(inches: number): string {
  const total = Math.max(0, Math.round(inches))
  const ft = Math.floor(total / 12)
  const rem = total % 12
  if (rem === 0) return `${ft}'`
  return `${ft}' ${rem}"`
}

export function distanceToHouse(shape: Shape, _shapes: Shape[]): string {
  // Future: walk shapes for a HOUSE_WALL — none in the schema today.
  // Use the default site-context wall placement: y = DEFAULT_HOUSE_Y_IN.
  const { cy } = shapeCenter(shape)
  // House wall runs along x axis at y = DEFAULT_HOUSE_Y_IN; nearest distance
  // from a centered shape is |cy - houseY| - height/2 (clamped at 0).
  const raw = Math.abs(cy - DEFAULT_HOUSE_Y_IN) - shape.height / 2
  const d = Math.max(0, raw)
  const face = cy < DEFAULT_HOUSE_Y_IN ? 'north face' : 'south face'
  return `${formatFtIn(d)} — ${face}`
}

export interface SetbackInfo {
  distance: string
  required: string
  violated: boolean
  edge: 'rear' | 'front' | 'left' | 'right'
}

export function distanceToSetback(shape: Shape, _shapes: Shape[]): SetbackInfo {
  const { cx, cy } = shapeCenter(shape)
  const halfW = shape.width / 2
  const halfH = shape.height / 2

  // Distances from each lot edge to the nearest shape edge (inches).
  const distRear = LOT_REAR_IN - (cy + halfH)
  const distFront = (cx - halfW) - LOT_FRONT_IN
  const distLeft = (cx - halfW) - -LOT_HALF_WIDTH_IN
  const distRight = LOT_HALF_WIDTH_IN - (cx + halfW)

  const candidates: Array<{ edge: SetbackInfo['edge']; dist: number; required: number }> = [
    { edge: 'rear', dist: distRear, required: REAR_SETBACK_IN },
    { edge: 'front', dist: distFront, required: REAR_SETBACK_IN },
    { edge: 'left', dist: distLeft, required: SIDE_SETBACK_IN },
    { edge: 'right', dist: distRight, required: SIDE_SETBACK_IN },
  ]

  // Pick the most-constraining (smallest dist - required) edge.
  let worst = candidates[0]!
  for (const c of candidates) {
    if (c.dist - c.required < worst.dist - worst.required) worst = c
  }

  return {
    distance: `${formatFtIn(Math.max(0, worst.dist))} ${worst.edge}`,
    required: `req. ${formatFtIn(worst.required)}`,
    violated: worst.dist < worst.required,
    edge: worst.edge,
  }
}

/**
 * Earthwork for a site, folded into the same summary everything else reads.
 *
 * Separate from `computeMeasurements` because the grade is not part of the shape
 * list, and because a caller with no grade must get the same answer as before:
 * zero, not a guess.
 */
export function withEarthwork(
  summary: MeasurementSummary,
  grade: { existing: SiteGrade; finished: SiteGrade } | null | undefined,
  bounds: Bounds | null,
): MeasurementSummary {
  if (!grade || !bounds) return summary
  if (!grade.existing.enabled && !grade.finished.enabled) return summary

  const earthwork = cutFillBetween(grade.existing, grade.finished, bounds)
  const surface = grade.finished.enabled ? grade.finished : grade.existing

  return {
    ...summary,
    cutYards: earthwork.cutYards,
    fillYards: earthwork.fillYards,
    maxSlopePct: Math.round(maxSlope(surface, bounds) * 1000) / 10,
  }
}

export function computeMeasurements(shapes: Shape[]): MeasurementSummary {
  const summary: MeasurementSummary = { ...EMPTY_SUMMARY }
  const visible = shapes.filter((s) => !s.hidden)

  for (const shape of visible) {
    if (isPool(shape)) {
      const ellipse = shape.displayHint?.poolShape === 'ellipse'
      const area = ellipse
        ? ellipseAreaSqft(shape.width, shape.height)
        : rectangleAreaSqft(shape.width, shape.height)
      const perimeter = ellipse
        ? ellipsePerimeterLf(shape.width, shape.height)
        : rectanglePerimeterLf(shape.width, shape.height)
      const avgDepth = (shape.depthShallow + shape.depthDeep) / 2
      summary.poolSurfaceArea += area
      summary.poolPerimeter += perimeter
      summary.poolWettedArea += wettedAreaSqft(area, perimeter, avgDepth)
      summary.poolGallons += poolGallons(area, avgDepth)
      summary.poolLengthFt = Math.max(summary.poolLengthFt, shape.width / 12)
      summary.poolWidthFt = Math.max(summary.poolWidthFt, shape.height / 12)
      // Multiple pools: keep the deepest depths rather than letting the last
      // pool overwrite. Coping follows the pool perimeter; deco drain is a
      // separate deck feature sourced only from deco-drain stencils.
      summary.poolDepthShallow = Math.max(summary.poolDepthShallow, shape.depthShallow)
      summary.poolDepthDeep = Math.max(summary.poolDepthDeep, shape.depthDeep)
      summary.poolAvgDepth = (summary.poolDepthShallow + summary.poolDepthDeep) / 2
      summary.copingLinearFeet += perimeter
      summary.hasPool = true
    } else if (isPolygonPool(shape)) {
      // A freeform pool measures from its own silhouette. Using the bounding
      // box here would over-count every concave footprint, which is exactly
      // the error the image pipeline exists to avoid.
      const area = polygonArea(shape.points)
      const perimeter = polygonPerimeter(shape.points)
      const bounds = polygonBounds(shape.points)
      const avgDepth = (shape.depthShallow + shape.depthDeep) / 2
      summary.poolSurfaceArea += area
      summary.poolPerimeter += perimeter
      summary.poolWettedArea += wettedAreaSqft(area, perimeter, avgDepth)
      summary.poolGallons += poolGallons(area, avgDepth)
      summary.poolLengthFt = Math.max(summary.poolLengthFt, bounds.width / 12)
      summary.poolWidthFt = Math.max(summary.poolWidthFt, bounds.height / 12)
      summary.poolDepthShallow = Math.max(summary.poolDepthShallow, shape.depthShallow)
      summary.poolDepthDeep = Math.max(summary.poolDepthDeep, shape.depthDeep)
      summary.poolAvgDepth = (summary.poolDepthShallow + summary.poolDepthDeep) / 2
      summary.copingLinearFeet += perimeter
      summary.hasPool = true
    } else if (isDeck(shape)) {
      summary.deckArea += rectangleAreaSqft(shape.width, shape.height)
      summary.hasDeck = true
    } else if (isFeature(shape)) {
      summary.featureCount += 1
      if (shape.kind === ShapeKind.BENCH) {
        summary.benchLinearFeet += Math.max(shape.width, shape.height) / 12
      } else if (shape.kind === ShapeKind.SPA) {
        summary.spaCount += 1
      }
    } else if (isStencil(shape)) {
      const def = getStencil(shape.stencilId)
      if (!def) continue
      // Lighting and water features are counted from the drawing so that
      // placing one moves the quote. Everything else still measures by
      // behaviour below.
      const quoteCategory = quoteCategoryForStencil(def)
      if (quoteCategory === PriceCategory.LIGHTING) summary.lightCount += 1
      else if (quoteCategory === PriceCategory.WATER_FEATURE) summary.waterFeatureCount += 1
      const area = rectangleAreaSqft(shape.width, shape.height)
      const perimeter = rectanglePerimeterLf(shape.width, shape.height)
      const longSideFt = Math.max(shape.width, shape.height) / 12
      switch (def.measurementBehavior) {
        case MeasurementBehavior.POOL_AREA_PERIMETER_GALLONS: {
          const avgDepth = (summary.poolDepthShallow + summary.poolDepthDeep) / 2 || 4
          summary.poolSurfaceArea += area
          summary.poolPerimeter += perimeter
          summary.poolWettedArea += wettedAreaSqft(area, perimeter, avgDepth)
          summary.poolGallons += poolGallons(area, avgDepth)
          summary.poolLengthFt = Math.max(summary.poolLengthFt, shape.width / 12)
          summary.poolWidthFt = Math.max(summary.poolWidthFt, shape.height / 12)
          summary.copingLinearFeet += perimeter
          summary.hasPool = true
          break
        }
        case MeasurementBehavior.SPA_AREA_PERIMETER_GALLONS:
          summary.featureCount += 1
          summary.spaCount += 1
          break
        case MeasurementBehavior.DECK_AREA:
        case MeasurementBehavior.LANAI_AREA:
          summary.deckArea += area
          summary.hasDeck = true
          break
        case MeasurementBehavior.COPING_LINEAR_FEET:
          summary.copingLinearFeet += longSideFt
          break
        case MeasurementBehavior.DECO_DRAIN_LINEAR_FEET:
          summary.decoDrainLinearFeet += longSideFt
          break
        case MeasurementBehavior.BENCH_LINEAR_FEET:
          summary.benchLinearFeet += longSideFt
          summary.featureCount += 1
          break
        case MeasurementBehavior.SHELF_AREA:
        case MeasurementBehavior.FEATURE_COUNT:
        case MeasurementBehavior.SCREEN_AREA:
        case MeasurementBehavior.FENCE_LINEAR_FEET:
        case MeasurementBehavior.WALL_LINEAR_FEET:
        case MeasurementBehavior.POINT_MARKER:
        case MeasurementBehavior.DIMENSION_LINE:
          summary.featureCount += 1
          break
        case MeasurementBehavior.NONE:
          break
      }
    }
  }

  return summary
}
