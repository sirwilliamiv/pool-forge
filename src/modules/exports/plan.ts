// What a plan sheet is allowed to claim.
//
// The construction packet shipped a legend naming eight symbols — property
// line, setback line, centre line, dimension line, equipment pad, access arrow,
// approval block, notes block — and drew none of them. A legend that describes
// a different drawing is worse than no legend: it tells a crew to go looking
// for information that is not there.
//
// So the legend is derived from the same reading of the drawing that the plan
// itself is drawn from. A symbol appears in the legend only when it is on the
// sheet, and the sheet cannot gain a symbol without the legend gaining a row.

import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'
import {
  findEquipmentPads,
  findPropertyLine,
  findStructures,
  isRegulated,
  regulatedBounds,
} from '@/modules/editor/site/model'

export type PlanVariant = 'site' | 'construction'

export type LegendKey =
  | 'property-line'
  | 'setback-line'
  | 'structure'
  | 'pool'
  | 'deck'
  | 'equipment-pad'
  | 'plumbing'
  | 'centre-line'
  | 'dimension'
  | 'north-arrow'
  | 'scale-bar'

export interface LegendEntry {
  key: LegendKey
  label: string
}

const LEGEND_LABELS: Record<LegendKey, string> = {
  'property-line': 'Property line',
  'setback-line': 'Required setback',
  structure: 'Existing structure',
  pool: 'Pool / spa (water edge)',
  deck: 'Deck / paving',
  'equipment-pad': 'Equipment pad',
  plumbing: 'Plumbing run (route on site)',
  'centre-line': 'Centre line',
  dimension: 'Dimension',
  'north-arrow': 'North arrow',
  'scale-bar': 'Graphic scale',
}

/** Printed inches per drawing box, per sheet size. */
export interface PlanBox {
  widthIn: number
  heightIn: number
}

/** Standard architect/engineer scales, in feet per printed inch. */
const SCALES = [1, 2, 4, 5, 8, 10, 16, 20, 30, 40, 50, 60, 80, 100, 150, 200]

export interface PlanFrame {
  /** The viewBox, in drawing inches. */
  view: { x: number; y: number; width: number; height: number }
  /** Feet per printed inch — true when the sheet is printed at 100%. */
  ftPerInch: number
  /** Nothing to draw. */
  empty: boolean
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Everything the plan draws, including the lot, which is usually the largest. */
export function planContentBounds(shapes: Shape[]): Rect | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let found = false
  for (const shape of shapes) {
    if (shape.hidden) continue
    found = true
    minX = Math.min(minX, shape.x)
    minY = Math.min(minY, shape.y)
    maxX = Math.max(maxX, shape.x + shape.width)
    maxY = Math.max(maxY, shape.y + shape.height)
  }
  if (!found) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Fit the drawing to a real scale.
 *
 * The old sheet said "not to scale unless dimensioned" and then dimensioned
 * nothing. A plan checker scales off the paper, so the sheet picks a standard
 * scale that fits and prints it, which makes the statement on the sheet true
 * rather than a disclaimer.
 */
export function planFrame(shapes: Shape[], box: PlanBox, marginFt = 8): PlanFrame {
  const content = planContentBounds(shapes)
  if (!content || box.widthIn <= 0 || box.heightIn <= 0) {
    return {
      view: { x: -12 * 12, y: -12 * 12, width: 24 * 12, height: 24 * 12 },
      ftPerInch: 8,
      empty: true,
    }
  }

  // Room for the dimension strings, which live outside the objects they
  // measure. Without it the outermost dimension prints on the sheet border.
  const margin = marginFt * 12
  const needWidthFt = (content.width + margin * 2) / 12
  const needHeightFt = (content.height + margin * 2) / 12

  // Eighty-eight per cent, not a hundred: the dimension strings, the north
  // arrow and the scale bar are drawn outside the objects they describe, and a
  // scale that fits the objects exactly puts all three off the paper.
  const FILL = 0.88
  let ftPerInch = SCALES[SCALES.length - 1] ?? 200
  for (const candidate of SCALES) {
    if (
      needWidthFt <= box.widthIn * candidate * FILL &&
      needHeightFt <= box.heightIn * candidate * FILL
    ) {
      ftPerInch = candidate
      break
    }
  }

  const viewWidth = box.widthIn * ftPerInch * 12
  const viewHeight = box.heightIn * ftPerInch * 12
  const centreX = content.x + content.width / 2
  const centreY = content.y + content.height / 2

  return {
    view: {
      x: centreX - viewWidth / 2,
      y: centreY - viewHeight / 2,
      width: viewWidth,
      height: viewHeight,
    },
    ftPerInch,
    empty: false,
  }
}

/** A round bar length that is a sensible fraction of the sheet, in feet. */
export function scaleBarFeet(ftPerInch: number): number {
  const raw = ftPerInch * 2
  const steps = [5, 10, 20, 25, 50, 100, 200, 400]
  for (const step of steps) {
    if (raw <= step) return step
  }
  return steps[steps.length - 1] ?? 400
}

function hasDeck(shapes: Shape[]): boolean {
  return shapes.some(
    shape =>
      !shape.hidden &&
      (shape.kind === ShapeKind.CONCRETE_DECK ||
        shape.kind === ShapeKind.PAVER_DECK ||
        shape.kind === ShapeKind.GRASS_AREA),
  )
}

/**
 * The legend for this drawing, and nothing else.
 *
 * Every entry corresponds to something `TechnicalPlanSvg` actually draws for
 * these shapes: same predicates, one reading.
 */
export function planLegend(shapes: Shape[], variant: PlanVariant): LegendEntry[] {
  const keys: LegendKey[] = []
  const lot = findPropertyLine(shapes)
  const water = regulatedBounds(shapes)

  if (lot) {
    keys.push('property-line')
    const limits = lot.limits
    if (limits.frontFt !== undefined || limits.sideFt !== undefined || limits.rearFt !== undefined) {
      keys.push('setback-line')
    }
  }
  if (findStructures(shapes).length > 0) keys.push('structure')
  if (shapes.some(shape => !shape.hidden && isRegulated(shape))) keys.push('pool')
  if (hasDeck(shapes)) keys.push('deck')

  const pads = findEquipmentPads(shapes)
  if (pads.length > 0) {
    keys.push('equipment-pad')
    if (water) keys.push('plumbing')
  }

  if (variant === 'construction' && water) keys.push('centre-line')
  if (water || lot) keys.push('dimension')
  keys.push('north-arrow', 'scale-bar')

  return keys.map(key => ({ key, label: LEGEND_LABELS[key] }))
}
