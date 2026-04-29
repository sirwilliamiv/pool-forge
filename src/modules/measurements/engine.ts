import {
  isDeck,
  isFeature,
  isPool,
  type Shape,
} from '@/modules/editor/state/shapes'
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
      if (shape.kind === 'bench') {
        summary.benchLinearFeet += Math.max(shape.width, shape.height) / 12
      }
    }
  }

  return summary
}
