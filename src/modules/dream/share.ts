// A backyard, small enough to live in a URL.
//
// WHY A CODE AND NOT A ROW
//
// Sharing is the thing this feature is for, so the share path has to be the
// cheapest path in the product. A design that had to be saved before it could
// be sent would need a write, a row, a lifetime and a cleanup job, and it would
// put a database outage between somebody and the link they are trying to text
// to their partner. Eleven multiple-choice answers fit in eleven characters, so
// the link carries the design itself and the server has nothing to look up.
//
// `DreamDesign` still exists, but it is a lead: it records that somebody asked
// to be contacted about a design, not the design's identity. A share needs no
// row at all.
//
// FORMAT
//
// One base-36 character per field, in a fixed order, behind a version
// character. Not the tightest packing available and deliberately so: bit
// packing off by one produces a link that opens somebody else's pool, which is
// a silent, unreportable failure, and eleven characters is already short enough
// that nothing is bought by making it eight.
//
// Every field decodes independently and out-of-range values fall back to the
// default. A link that lost its last characters in a text message should open
// the pool it can still read.

import {
  BUDGETS,
  DECK_MATERIALS,
  DECK_SIZES,
  DEPTH_PROFILES,
  INTERIOR_FINISHES,
  MAX_LIGHTS,
  MAX_WATER_FEATURES,
  POOL_SHAPES,
  POOL_SIZES,
  type ChoiceMeta,
} from './catalog'
import { coerceDreamConfig, DEFAULT_DREAM, type DreamConfig } from './config'

/**
 * The version character.
 *
 * Bumped only if the meaning of a position changes. Adding a field to the end
 * does not need a bump, because a shorter code already decodes as "defaults for
 * everything after here", which is exactly what an older link means.
 */
const VERSION = '1'

/** Longest code we will look at. Anything longer is not one of ours. */
const MAX_CODE_LENGTH = 32

const RADIX = 36

/** Flags, in bit order. Adding one appends; never reorder. */
const FLAG_FIELDS = ['spa', 'heater', 'saltwater', 'screenEnclosure'] as const

function digit(value: number): string {
  // Every value written here is bounded by a catalogue length or an explicit
  // maximum, all of which are well under 36. Clamping rather than throwing
  // keeps a bad value from turning a share button into an error.
  return Math.max(0, Math.min(RADIX - 1, Math.round(value))).toString(RADIX)
}

/** A character back to its number, or null if it is not a base-36 digit. */
function value(char: string | undefined): number | null {
  if (char === undefined) return null
  const parsed = Number.parseInt(char, RADIX)
  return Number.isNaN(parsed) ? null : parsed
}

function indexOfId(list: readonly ChoiceMeta[], id: string): number {
  const index = list.findIndex((o) => o.id === id)
  return index === -1 ? 0 : index
}

function idAtIndex(list: readonly ChoiceMeta[], index: number | null): string | undefined {
  if (index === null) return undefined
  return list[index]?.id
}

/**
 * The config as a share code.
 *
 * Stable: the same config always produces the same code, so a link somebody
 * saved keeps working and two people who build the same pool get the same link.
 */
export function encodeDream(config: DreamConfig): string {
  const flags = FLAG_FIELDS.reduce(
    (bits, field, i) => (config[field] ? bits | (1 << i) : bits),
    0,
  )

  return [
    VERSION,
    digit(indexOfId(POOL_SHAPES, config.shape)),
    digit(indexOfId(POOL_SIZES, config.size)),
    digit(indexOfId(DEPTH_PROFILES, config.depth)),
    digit(indexOfId(INTERIOR_FINISHES, config.finish)),
    digit(indexOfId(DECK_SIZES, config.deckSize)),
    digit(indexOfId(DECK_MATERIALS, config.deckMaterial)),
    digit(indexOfId(BUDGETS, config.budget)),
    digit(flags),
    digit(config.waterFeatures),
    digit(config.extraLights),
  ].join('')
}

/**
 * A share code back into a backyard.
 *
 * Never throws and never returns null. A visitor who followed a link is owed a
 * pool, not an error page, and the worst a mangled code can do is open the
 * default one. `coerceDreamConfig` is the final gate: nothing leaves here that
 * the schema would refuse.
 */
export function decodeDream(code: string | null | undefined): DreamConfig {
  if (typeof code !== 'string') return DEFAULT_DREAM

  const trimmed = code.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_CODE_LENGTH) return DEFAULT_DREAM
  if (trimmed[0] !== VERSION) return DEFAULT_DREAM

  const body = trimmed.slice(1).toLowerCase()
  const at = (i: number): number | null => value(body[i])

  const flags = at(7)
  const flagValues: Partial<Record<(typeof FLAG_FIELDS)[number], boolean>> = {}
  if (flags !== null) {
    FLAG_FIELDS.forEach((field, i) => {
      flagValues[field] = (flags & (1 << i)) !== 0
    })
  }

  const waterFeatures = at(8)
  const extraLights = at(9)

  // Assembled as a partial and handed to the coercer rather than being built
  // field by field with fallbacks here: one place decides what a valid config
  // is, and it is the schema.
  return coerceDreamConfig({
    ...DEFAULT_DREAM,
    ...dropUndefined({
      shape: idAtIndex(POOL_SHAPES, at(0)),
      size: idAtIndex(POOL_SIZES, at(1)),
      depth: idAtIndex(DEPTH_PROFILES, at(2)),
      finish: idAtIndex(INTERIOR_FINISHES, at(3)),
      deckSize: idAtIndex(DECK_SIZES, at(4)),
      deckMaterial: idAtIndex(DECK_MATERIALS, at(5)),
      budget: idAtIndex(BUDGETS, at(6)),
    }),
    ...flagValues,
    ...(waterFeatures !== null && waterFeatures <= MAX_WATER_FEATURES ? { waterFeatures } : {}),
    ...(extraLights !== null && extraLights <= MAX_LIGHTS ? { extraLights } : {}),
  })
}

/**
 * Strip absent keys.
 *
 * `exactOptionalPropertyTypes` is on, and spreading an object holding
 * `{ shape: undefined }` writes the key as `undefined` rather than leaving it
 * out, which would overwrite the default with nothing.
 */
function dropUndefined(source: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(source)) {
    if (val !== undefined) out[key] = val
  }
  return out
}

/** Where a design lives on the web. Relative, so it works in every environment. */
export function dreamPath(config: DreamConfig): string {
  return `/dream/${encodeDream(config)}`
}
