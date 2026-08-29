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
  /**
   * Words that followed the measurement, verbatim.
   *
   * A drawing labels distances with what they are: `5' easement`, `10 ft
   * setback`, `3' clearance`. The measurement is real and worth reading; the
   * word changes what it describes. Reported rather than discarded, because a
   * setback is a legal offset and not the size of anything drawn, and a caller
   * deriving scale from it would be measuring the wrong span.
   */
  qualifier: string | null
}

/**
 * Qualifiers that describe an offset rather than an object.
 *
 * Not a general vocabulary: only words that mean "this distance is a rule, not a
 * thing". Anything else is left alone so an unfamiliar label is not silently
 * demoted.
 */
const OFFSET_QUALIFIERS =
  /\b(easement|setback|set back|right[- ]of[- ]way|row|buffer|clearance|offset|no[- ]build)\b/

/** True when this measurement describes a required distance, not a drawn object. */
export function isOffsetQualifier(qualifier: string | null): boolean {
  return qualifier !== null && OFFSET_QUALIFIERS.test(qualifier.toLowerCase())
}

export function parseDimension(text: string, options: ParseDimensionOptions = {}): ParsedDimension {
  const full = normalize(text)
  if (full === '') {
    return { inches: null, assumedUnit: false, reason: 'empty dimension text', qualifier: null }
  }

  // The whole string first. Splitting before trying this turned `32' 6"` into
  // `32'` with `6"` mistaken for a description, quietly losing six inches.
  const whole = parseMeasurement(full, options)
  if (whole.inches !== null) return { ...whole, qualifier: null }

  // Only now consider that a label followed the measurement. Before this an
  // ordinary `5' easement` matched none of the anchored patterns and the number
  // was lost with the word.
  const { measurement, qualifier } = splitQualifier(full)
  if (qualifier === null) return { ...whole, qualifier: null }

  const parsed = parseMeasurement(measurement, options)
  return { ...parsed, qualifier }
}

/** The patterns, against one string, with no notion of a trailing label. */
function parseMeasurement(normalized: string, options: ParseDimensionOptions): Omit<ParsedDimension, 'qualifier'> {
  const defaultUnit = options.defaultUnit ?? null

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
      return {
        inches: null,
        assumedUnit: false,
        reason: 'no unit written and no default unit for this image kind',
      }
    }
    return { inches: value * INCHES_PER_UNIT[defaultUnit], assumedUnit: true, reason: null }
  }

  return { inches: null, assumedUnit: false, reason: 'unrecognized dimension format' }
}

/** What a second measurement looks like following the first. */
const CONTINUATION = /^(?:x|by|\*|×|-|to|\d)/

/**
 * Take the measurement off the front and keep the rest.
 *
 * Only splits where a unit or a number clearly ends, so `4 ft 6 in` stays whole
 * and `5' easement` becomes `5'` plus `easement`.
 */
function splitQualifier(text: string): { measurement: string; qualifier: string | null } {
  const leading =
    /^(\d+(?:\.\d+)?\s*(?:'|ft\.?|feet|foot)\s*(?:-|\s)?\s*\d+(?:\.\d+)?\s*(?:"|''|in\.?|inch(?:es)?)?)\s+(.+)$/.exec(text) ??
    /^(\d+(?:\.\d+)?\s*(?:'|"|''|ft\.?|feet|foot|in\.?|inch(?:es)?|m|meters?|metres?|cm|centimet(?:er|re)s?|yd|yds|yards?))\s+(.+)$/.exec(text) ??
    /^(\d+(?:\.\d+)?)\s+([a-z].*)$/.exec(text)

  if (!leading) return { measurement: text, qualifier: null }
  const rest = (leading[2] ?? '').trim()
  if (rest === '') return { measurement: text, qualifier: null }

  // A trailing unit word is part of the measurement, not a description of it.
  if (unitFrom(rest) !== null) return { measurement: text, qualifier: null }

  // Neither is the other half of a compound expression. `12 x 24` is two
  // dimensions and must still be refused rather than read as twelve of
  // something, which is exactly the guess this parser exists not to make.
  if (CONTINUATION.test(rest)) return { measurement: text, qualifier: null }

  return { measurement: (leading[1] ?? '').trim(), qualifier: rest }
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
