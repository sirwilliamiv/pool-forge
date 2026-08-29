// Turning eleven choices into the same measurements a drawn project produces.
//
// WHY NOT JUST DRAW IT
//
// The obvious move is to build `Shape` objects and hand them to
// `computeMeasurements`, which would make the studio measure through exactly
// the code the editor measures through. It was not done, for two reasons.
//
// A `Shape` graph needs the editor's stencil catalogue, its state store and its
// id scheme, none of which a marketing page has any business loading, and the
// studio's own concepts (a "lounging deck", four water features) have no
// drawn equivalent to build: they would have to be invented as shapes and then
// measured back out, which is a longer road to the same arithmetic.
//
// More importantly, the arithmetic is not what would drift. Every line below
// calls the same primitive from `src/lib/geometry` that
// `modules/measurements/engine.ts` calls for the same quantity, so a fix to how
// a pool's gallons or wetted area are worked out lands in both places at once.
// What this file owns is only the mapping from a choice to a dimension, and
// that mapping has no counterpart in the editor to drift from.
//
// The result is a real `MeasurementSummary`, so the real `computeQuote` prices
// it, unchanged.

import {
  ellipseAreaSqft,
  ellipsePerimeterLf,
} from '@/lib/geometry/ellipse'
import {
  poolGallons,
  rectangleAreaSqft,
  rectanglePerimeterLf,
  wettedAreaSqft,
} from '@/lib/geometry/rectangle'
import type { MeasurementSummary } from '@/modules/measurements/engine'

import {
  baselineLightCount,
  deckSizeById,
  depthById,
  shapeById,
  sizeById,
  sizeInches,
} from './catalog'
import type { DreamConfig } from './config'

/**
 * Bench and swim-out, in linear feet.
 *
 * Every pool in this catalogue has an entry step, and a step is a bench as far
 * as the price book is concerned. Scaled to the pool's width because that is
 * what a step spans, and left off the wading pool, where the floor is the step.
 */
function benchFeet(widthFt: number, depthId: string): number {
  if (depthId === 'wading') return 0
  return widthFt * 0.5
}

/**
 * A spa's own surface area, in square feet.
 *
 * Spas are sold by the unit rather than by the foot, so this exists only to add
 * the water it holds to the pool's gallons. Seven feet across is the standard
 * six-to-eight seat round spa; nothing in the studio lets a visitor change it,
 * because nobody arriving here has an opinion about spa diameter.
 */
const SPA_DIAMETER_FT = 7
const SPA_DEPTH_FT = 3.5

/**
 * How much of a pool's footprint has to be dug out beyond the water itself.
 *
 * Over-excavation for the shell, the bond beam and working room round the
 * outside. A flat 25% on the water volume, which is the rule of thumb a
 * builder uses to order haulage before anybody has surveyed anything.
 */
const OVERDIG_FACTOR = 1.25
const CUBIC_YARDS_PER_CUBIC_FOOT = 1 / 27

export function measureDream(config: DreamConfig): MeasurementSummary {
  const shape = shapeById(config.shape)
  const size = sizeById(config.size)
  const depth = depthById(config.depth)
  const deck = deckSizeById(config.deckSize)
  const { widthIn, heightIn } = sizeInches(size)

  // The bounding box, measured the way the editor measures a rectangle, then
  // scaled by what this shape does with its box. The oval takes the ellipse
  // primitives directly rather than a factor, because there is an exact answer
  // for an ellipse and using an approximation next to it would be a choice to
  // be less correct.
  const boxArea = rectangleAreaSqft(widthIn, heightIn)
  const boxPerimeter = rectanglePerimeterLf(widthIn, heightIn)
  const isOval = shape.outline === 'oval'
  const poolSurfaceArea = isOval ? ellipseAreaSqft(widthIn, heightIn) : boxArea * shape.areaFactor
  const poolPerimeter = isOval
    ? ellipsePerimeterLf(widthIn, heightIn)
    : boxPerimeter * shape.perimeterFactor

  const avgDepth = (depth.shallowFt + depth.deepFt) / 2
  const spaArea = config.spa ? Math.PI * (SPA_DIAMETER_FT / 2) ** 2 : 0
  const spaGallons = config.spa ? poolGallons(spaArea, SPA_DEPTH_FT) : 0

  const deckArea = poolSurfaceArea * deck.areaFactor
  const lightCount = baselineLightCount(poolSurfaceArea) + config.extraLights

  // Water volume, over-dug, in cubic yards. Cut only: a back yard pool on the
  // flat ground this tool has to assume produces spoil to haul away and no
  // fill to bring in, and inventing a fill figure would put a line on the
  // ballpark for work nobody can see the need for.
  const cutYards =
    poolSurfaceArea * avgDepth * OVERDIG_FACTOR * CUBIC_YARDS_PER_CUBIC_FOOT

  return {
    poolSurfaceArea,
    poolPerimeter,
    poolGallons: poolGallons(poolSurfaceArea, avgDepth) + spaGallons,
    poolWettedArea: wettedAreaSqft(poolSurfaceArea, poolPerimeter, avgDepth),
    poolLengthFt: size.lengthFt,
    poolWidthFt: size.widthFt,
    poolDepthShallow: depth.shallowFt,
    poolDepthDeep: depth.deepFt,
    poolAvgDepth: avgDepth,
    deckArea,
    // Coping follows the pool's own edge, exactly as it does for a drawn pool.
    copingLinearFeet: poolPerimeter,
    // Deco drain is the deck's edge against the coping. Only worth having once
    // there is a deck wide enough to shed water onto, which the walkway is not.
    decoDrainLinearFeet: config.deckSize === 'minimal' ? 0 : poolPerimeter,
    benchLinearFeet: benchFeet(size.widthFt, config.depth),
    // A spa is a feature; so is every water feature placed. Lights are counted
    // separately by the pricing engine and deliberately not folded in here.
    featureCount: (config.spa ? 1 : 0) + config.waterFeatures,
    spaCount: config.spa ? 1 : 0,
    lightCount,
    waterFeatureCount: config.waterFeatures,
    hasPool: true,
    hasDeck: deckArea > 0,
    cutYards,
    fillYards: 0,
    // The studio cannot see the site, so it cannot claim a slope. Zero is what
    // every drawing made before grading existed reports, and it is the only
    // honest answer here. `spread.ts` is where not knowing the ground shows up.
    maxSlopePct: 0,
  }
}
