// Deterministic parsing of the dimension text the model read off a drawing.
//
// The model reports the literal characters it saw. Turning those characters
// into a number is pure TypeScript, because a number that reaches a quote must
// be reproducible and auditable. Anything that does not parse cleanly becomes
// `null` plus a warning, never a guess.

export type LinearUnit = 'ft' | 'in' | 'm' | 'cm' | 'yd'

const INCHES_PER_UNIT: Record<LinearUnit, number> = {
  ft: 12,
  in: 1,
  m: 39.3700787,
  cm: 0.393700787,
  yd: 36,
}

const UNIT_ALIASES: { pattern: RegExp; unit: LinearUnit }[] = [
  { pattern: /^(?:'|ft|ft\.|feet|foot)$/, unit: 'ft' },
  { pattern: /^(?:"|''|in|in\.|inch|inches)$/, unit: 'in' },
  { pattern: /^(?:m|meter|meters|metre|metres)$/, unit: 'm' },
  { pattern: /^(?:cm|centimeter|centimeters|centimetre|centimetres)$/, unit: 'cm' },
  { pattern: /^(?:yd|yds|yard|yards)$/, unit: 'yd' },
]

function unitFrom(token: string): LinearUnit | null {
  const normalized = token.trim().toLowerCase()
  for (const alias of UNIT_ALIASES) {
    if (alias.pattern.test(normalized)) return alias.unit
  }
  return null
}

/** Strip decoration the model faithfully transcribed: labels, tildes, commas. */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[‘’′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/^(?:l|w|d|len|length|width|depth|dia|diameter|r|radius)\s*[:=]\s*/i, '')
    .replace(/^(?:~|≈|approx\.?|about|approximately)\s*/i, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const FEET_INCHES = /^(\d+(?:\.\d+)?)\s*(?:'|ft\.?|feet|foot)\s*(?:-|\s)?\s*(\d+(?:\.\d+)?)\s*(?:"|''|in\.?|inch(?:es)?)?$/
const VALUE_UNIT = /^(\d+(?:\.\d+)?)\s*('|"|''|ft\.?|feet|foot|in\.?|inch(?:es)?|m|meters?|metres?|cm|centimet(?:er|re)s?|yd|yds|yards?)$/
const BARE_NUMBER = /^(\d+(?:\.\d+)?)$/

export interface ParseDimensionOptions {
  /**
   * Unit assumed for a bare number such as `32`. Sketches and site plans are
   * dimensioned in feet in every market this ships to, but the assumption is
   * reported back so the caller can lower confidence and warn.
   */
  defaultUnit?: LinearUnit | null
}

export interface ParsedDimension {
  inches: number | null
  /** True when `defaultUnit` had to be applied because no unit was written. */
  assumedUnit: boolean
  reason: string | null
}

export function parseDimension(text: string, options: ParseDimensionOptions = {}): ParsedDimension {
  const defaultUnit = options.defaultUnit ?? null
  const normalized = normalize(text)
  if (normalized === '') {
    return { inches: null, assumedUnit: false, reason: 'empty dimension text' }
  }

  const feetInches = FEET_INCHES.exec(normalized)
  if (feetInches !== null) {
    const feet = Number.parseFloat(feetInches[1] ?? '')
    const inches = Number.parseFloat(feetInches[2] ?? '')
    if (Number.isFinite(feet) && Number.isFinite(inches)) {
      return { inches: feet * 12 + inches, assumedUnit: false, reason: null }
    }
  }

  const valueUnit = VALUE_UNIT.exec(normalized)
  if (valueUnit !== null) {
    const value = Number.parseFloat(valueUnit[1] ?? '')
    const unit = unitFrom(valueUnit[2] ?? '')
    if (Number.isFinite(value) && unit !== null && value > 0) {
      return { inches: value * INCHES_PER_UNIT[unit], assumedUnit: false, reason: null }
    }
  }

  const bare = BARE_NUMBER.exec(normalized)
  if (bare !== null) {
    const value = Number.parseFloat(bare[1] ?? '')
    if (!Number.isFinite(value) || value <= 0) {
      return { inches: null, assumedUnit: false, reason: 'non-positive dimension value' }
    }
    if (defaultUnit === null) {
      return { inches: null, assumedUnit: false, reason: 'no unit written and no default unit for this image kind' }
    }
    return { inches: value * INCHES_PER_UNIT[defaultUnit], assumedUnit: true, reason: null }
  }

  return { inches: null, assumedUnit: false, reason: 'unrecognized dimension format' }
}

/** Convenience wrapper for callers that only want the number. */
export function parseDimensionToInches(text: string, options: ParseDimensionOptions = {}): number | null {
  return parseDimension(text, options).inches
}

const SQUARE_LEGEND =
  /(?:^|\b)(\d+(?:\.\d+)?)?\s*(?:sq|sqr|square|squares|box|boxes|block|blocks|cell|cells|grid(?:\s*square)?)\s*(?:=|is|equals|:)\s*(\d+(?:\.\d+)?)\s*('|"|''|ft\.?|feet|foot|in\.?|inch(?:es)?|m|meters?|metres?|cm|centimet(?:er|re)s?)/

export interface ParsedScaleLegend {
  unitsPerSquare: number
  unit: 'ft' | 'in' | 'm' | 'cm'
}

/**
 * Read a graph-paper legend such as `1 square = 1 ft` or `each box = 6"`. Only
 * the per-square family is handled here; a printed ratio scale on a plat rides
 * on the site plan scale bar instead.
 */
export function parseScaleLegend(text: string): ParsedScaleLegend | null {
  const normalized = normalize(text)
  const match = SQUARE_LEGEND.exec(normalized)
  if (match === null) return null
  const squares = match[1] === undefined ? 1 : Number.parseFloat(match[1])
  const value = Number.parseFloat(match[2] ?? '')
  const unit = unitFrom(match[3] ?? '')
  if (!Number.isFinite(squares) || squares <= 0) return null
  if (!Number.isFinite(value) || value <= 0) return null
  if (unit === null || unit === 'yd') return null
  return { unitsPerSquare: value / squares, unit }
}

export function inchesToFeet(inches: number): number {
  return inches / 12
}
