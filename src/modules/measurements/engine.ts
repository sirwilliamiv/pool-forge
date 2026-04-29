import { ShapeKind } from '@prisma/client'
import {
  isDeck,
  isFeature,
  isPool,
  isStencil,
  type Shape,
} from '@/modules/editor/state/shapes'
import { getStencil } from '@/modules/editor/stencils'
import { MeasurementBehavior } from '@/modules/editor/stencils/types'
import {
  poolGallons,
  rectangleAreaSqft,
  rectanglePerimeterLf,
  wettedAreaSqft,
} from '@/lib/geometry/rectangle'

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
  hasPool: boolean
  hasDeck: boolean
}

const EMPTY_SUMMARY: MeasurementSummary = {
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
  hasPool: false,
  hasDeck: false,
}

export function computeMeasurements(shapes: Shape[]): MeasurementSummary {
  const summary: MeasurementSummary = { ...EMPTY_SUMMARY }
  const visible = shapes.filter((s) => !s.hidden)

  for (const shape of visible) {
    if (isPool(shape)) {
      const area = rectangleAreaSqft(shape.width, shape.height)
      const perimeter = rectanglePerimeterLf(shape.width, shape.height)
      const avgDepth = (shape.depthShallow + shape.depthDeep) / 2
      summary.poolSurfaceArea += area
      summary.poolPerimeter += perimeter
      summary.poolWettedArea += wettedAreaSqft(area, perimeter, avgDepth)
      summary.poolGallons += poolGallons(area, avgDepth)
      summary.poolLengthFt = Math.max(summary.poolLengthFt, shape.width / 12)
      summary.poolWidthFt = Math.max(summary.poolWidthFt, shape.height / 12)
      summary.poolDepthShallow = shape.depthShallow
      summary.poolDepthDeep = shape.depthDeep
      summary.poolAvgDepth = avgDepth
      summary.copingLinearFeet += perimeter
      summary.decoDrainLinearFeet += perimeter
      summary.hasPool = true
    } else if (isDeck(shape)) {
      summary.deckArea += rectangleAreaSqft(shape.width, shape.height)
      summary.hasDeck = true
    } else if (isFeature(shape)) {
      summary.featureCount += 1
      if (shape.kind === ShapeKind.BENCH) {
        summary.benchLinearFeet += Math.max(shape.width, shape.height) / 12
      }
    } else if (isStencil(shape)) {
      const def = getStencil(shape.stencilId)
      if (!def) continue
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
          summary.decoDrainLinearFeet += perimeter
          summary.hasPool = true
          break
        }
        case MeasurementBehavior.SPA_AREA_PERIMETER_GALLONS:
          summary.featureCount += 1
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
