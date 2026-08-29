// The picture of the backyard, worked out as data.
//
// The drawing is the reason this page is worth sharing, so it is not left to
// the component that renders it. This module turns a config into plain numbers
// and path strings, in one coordinate space, which means the studio and the
// share card draw exactly the same backyard, and the shapes can be tested
// without rendering anything.
//
// Coordinates are in feet and the origin is the top left of the lot. Feet
// rather than pixels because everything upstream is in feet, and a renderer
// that wants pixels has a viewBox to do it with.

import {
  deckMaterialById,
  deckSizeById,
  finishById,
  shapeById,
  sizeById,
} from './catalog'
import type { DreamConfig } from './config'

export interface Point {
  readonly x: number
  readonly y: number
}

export interface YardLayout {
  /** The whole drawing, in feet. Maps straight to an SVG viewBox. */
  readonly width: number
  readonly height: number
  /** The paved area around the pool. */
  readonly deck: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  /** The pool's bounding box, for anything that needs to sit against an edge. */
  readonly pool: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  /** The water's outline, as an SVG path in the same feet coordinates. */
  readonly poolPath: string
  /** Present only when the design has one. Sits on the pool's deep-end corner. */
  readonly spa: { readonly cx: number; readonly cy: number; readonly r: number } | null
  /** Where the lights sit, spaced along the pool's long walls. */
  readonly lights: readonly Point[]
  /** Where the water features sit, along the far edge of the pool. */
  readonly features: readonly Point[]
  /** Drawn when the design is enclosed. Follows the deck, set in a little. */
  readonly screen: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null
  readonly colors: {
    readonly water: string
    readonly deck: string
    readonly grass: string
    readonly coping: string
  }
}

/** Grass visible beyond the paving, in feet. Enough to read as a yard. */
const GRASS_MARGIN = 8

/**
 * How far inside its bounding box each outline's wall actually runs, as a
 * fraction of the box.
 *
 * Straight-sided shapes are flush with their box and take nothing. The two
 * curved outlines pull in hard on the ends, where an ellipse is at its
 * narrowest and a fixture placed at the box edge would sit in the coping.
 */
const EDGE_INSETS: Record<string, { insetX: number; insetY: number }> = {
  rect: { insetX: 0.04, insetY: 0 },
  ell: { insetX: 0.04, insetY: 0 },
  oval: { insetX: 0.18, insetY: 0.06 },
  kidney: { insetX: 0.14, insetY: 0.06 },
}

/** The spa's radius, matching the one `measure.ts` prices. */
const SPA_RADIUS = 3.5

/**
 * How far the paving runs past the pool on each side.
 *
 * Derived from the deck's total area rather than picked, so the drawing and the
 * priced deck area are the same deck. Solving the exact border width for a
 * given area means solving a quadratic; the approximation below is within a
 * few inches over the range of sizes this catalogue allows, and the drawing is
 * not the measurement.
 */
function deckBorderFeet(poolW: number, poolH: number, deckAreaSqft: number): number {
  const perimeter = 2 * (poolW + poolH)
  if (perimeter <= 0) return 0
  return Math.max(3, deckAreaSqft / perimeter)
}

function rectPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h / 2)
  return [
    `M ${x + radius} ${y}`,
    `H ${x + w - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w} ${y + radius}`,
    `V ${y + h - radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + w - radius} ${y + h}`,
    `H ${x + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x} ${y + h - radius}`,
    `V ${y + radius}`,
    `A ${radius} ${radius} 0 0 1 ${x + radius} ${y}`,
    'Z',
  ].join(' ')
}

function ovalPath(x: number, y: number, w: number, h: number): string {
  const rx = w / 2
  const ry = h / 2
  return [
    `M ${x} ${y + ry}`,
    `A ${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`,
    `A ${rx} ${ry} 0 0 1 ${x} ${y + ry}`,
    'Z',
  ].join(' ')
}

/**
 * The classic curve: two lobes with a waist bitten out of one long side.
 *
 * Six cubics round a closed loop, and the two that matter are the pair either
 * side of the waist: they share a tangent at the dip, which is what stops the
 * concavity coming out as a spike. An earlier version let those two segments
 * meet at whatever angle their control points happened to produce, and the
 * result was a pool with a thorn on it.
 */
function kidneyPath(x: number, y: number, w: number, h: number): string {
  const at = (fx: number, fy: number) => `${x + w * fx} ${y + h * fy}`

  return [
    // Left extreme, then up and over the left lobe.
    `M ${at(0, 0.55)}`,
    `C ${at(0, 0.2)} ${at(0.08, 0.02)} ${at(0.25, 0.02)}`,
    // Down into the waist. The dip's tangent is horizontal, and the next
    // segment leaves on the same tangent, so the two meet smoothly.
    `C ${at(0.36, 0.02)} ${at(0.42, 0.28)} ${at(0.5, 0.28)}`,
    `C ${at(0.58, 0.28)} ${at(0.64, 0)} ${at(0.78, 0)}`,
    // Over the right lobe and down the far wall.
    `C ${at(0.92, 0)} ${at(1, 0.2)} ${at(1, 0.5)}`,
    `C ${at(1, 0.78)} ${at(0.8, 1)} ${at(0.5, 1)}`,
    // The long unbroken belly, which is the side you swim.
    `C ${at(0.2, 1)} ${at(0, 0.85)} ${at(0, 0.55)}`,
    'Z',
  ].join(' ')
}

/**
 * How much of the L's bounding box the notch takes out of the bottom right.
 *
 * Named rather than inlined because the light placement has to know about it:
 * a light spaced evenly along "the bottom wall" of an L lands in the missing
 * corner, floating on the paving, which is the sort of detail that makes a
 * drawing look wrong without anybody being able to say why.
 */
const ELL_NOTCH_W = 0.42
const ELL_NOTCH_H = 0.38

/** A rectangle with a leg taken out of one corner. */
function ellPath(x: number, y: number, w: number, h: number): string {
  const notchW = w * ELL_NOTCH_W
  const notchH = h * ELL_NOTCH_H
  return [
    `M ${x} ${y}`,
    `H ${x + w}`,
    `V ${y + h - notchH}`,
    `H ${x + w - notchW}`,
    `V ${y + h}`,
    `H ${x}`,
    'Z',
  ].join(' ')
}

function poolOutline(
  outline: string,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  switch (outline) {
    case 'oval':
      return ovalPath(x, y, w, h)
    case 'kidney':
      return kidneyPath(x, y, w, h)
    case 'ell':
      return ellPath(x, y, w, h)
    default:
      // A "Roman end" is a rectangle whose ends are rounded hard; a plain
      // rectangle gets the small radius every gunite pool actually has, because
      // nobody builds a truly square corner underwater.
      return rectPath(x, y, w, h, Math.min(w, h) * 0.08)
  }
}

/**
 * Spread n points evenly along a span, inset from both ends.
 *
 * Used for lights and for features. Even spacing is what a builder would draw
 * and, more to the point, uneven spacing reads as a bug in the picture.
 */
function spread(count: number, from: number, to: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [(from + to) / 2]
  const step = (to - from) / (count + 1)
  return Array.from({ length: count }, (_, i) => from + step * (i + 1))
}

export function layoutYard(config: DreamConfig, lightCount: number): YardLayout {
  const size = sizeById(config.size)
  const shape = shapeById(config.shape)
  const deckMeta = deckSizeById(config.deckSize)
  const finish = finishById(config.finish)

  // Pool drawn long side horizontal, which is how a plan of a back yard is
  // almost always oriented on a page.
  const poolW = size.lengthFt
  const poolH = size.widthFt

  // The deck area the price is computed from, so the picture and the money
  // agree about how much paving there is.
  const poolAreaSqft = poolW * poolH * shape.areaFactor
  const border = deckBorderFeet(poolW, poolH, poolAreaSqft * deckMeta.areaFactor)

  const deckW = poolW + border * 2
  const deckH = poolH + border * 2
  const width = deckW + GRASS_MARGIN * 2
  const height = deckH + GRASS_MARGIN * 2

  const deckX = GRASS_MARGIN
  const deckY = GRASS_MARGIN
  const poolX = deckX + border
  const poolY = deckY + border

  // Everything that sits *on* the water's edge is placed against an inset
  // rectangle rather than against the pool's bounding box, because on a curved
  // pool the box is not the wall: a light pinned to the box edge floats out on
  // the coping, which reads as a bug in the drawing rather than as a curved
  // pool.
  //
  // The insets are per outline rather than derived from the area factor. The
  // L-shape gives away as much of its box as the kidney does, but it gives it
  // away in one corner: its four edges are real walls, and insetting them would
  // push every fixture into open water.
  const { insetX, insetY } = EDGE_INSETS[shape.outline] ?? { insetX: 0, insetY: 0 }
  const waterTop = poolY + poolH * insetY
  const waterBottom = poolY + poolH * (1 - insetY)
  const waterLeft = poolX + poolW * insetX
  const waterRight = poolX + poolW * (1 - insetX)

  const spa = config.spa
    ? {
        // Tucked against the water's top-right, overlapping the coping the way
        // a raised spillover spa actually sits. Held inside the paving, because
        // a seven-foot spa against a small pool's short border otherwise hangs
        // off the deck and out onto the lawn.
        cx: Math.min(waterRight - SPA_RADIUS * 0.6, deckX + deckW - SPA_RADIUS - 0.5),
        cy: Math.max(waterTop - SPA_RADIUS * 0.35, deckY + SPA_RADIUS + 0.5),
        r: SPA_RADIUS,
      }
    : null

  // How much of each wall is free to hang something on.
  //
  // The near wall runs short on an L: past the notch there is no wall, only
  // paving. The far wall runs short wherever the spa sits, because a bowl or a
  // light drawn underneath a spa is two objects claiming one corner, and on a
  // small pool that corner is most of the wall.
  const nearWallRight =
    shape.outline === 'ell' ? poolX + poolW * (1 - ELL_NOTCH_W) : waterRight
  const farWallRight = spa
    ? Math.max(waterLeft + 1, Math.min(waterRight, spa.cx - spa.r - 1))
    : waterRight

  // Lights alternate down the two long walls, starting with the near one. Each
  // wall is spaced on its own, so one wall being shorter does not push the
  // other wall's fixtures around.
  const nearCount = Math.ceil(lightCount / 2)
  const farCount = lightCount - nearCount
  const lights: Point[] = [
    ...spread(nearCount, waterLeft, nearWallRight).map((x) => ({ x, y: waterBottom - 1 })),
    ...spread(farCount, waterLeft, farWallRight).map((x) => ({ x, y: waterTop + 1 })),
  ]

  // Features sit on the far edge, where they are seen from the house.
  const features: Point[] = spread(config.waterFeatures, waterLeft, farWallRight).map((x) => ({
    x,
    y: waterTop - 0.5,
  }))

  return {
    width,
    height,
    deck: { x: deckX, y: deckY, w: deckW, h: deckH },
    pool: { x: poolX, y: poolY, w: poolW, h: poolH },
    poolPath: poolOutline(shape.outline, poolX, poolY, poolW, poolH),
    spa,
    lights,
    features,
    screen: config.screenEnclosure
      ? { x: deckX + 1, y: deckY + 1, w: deckW - 2, h: deckH - 2 }
      : null,
    colors: {
      water: finish.water,
      deck: deckMaterialById(config.deckMaterial).swatch,
      grass: '#BFD9A8',
      coping: '#F2EFE9',
    },
  }
}
