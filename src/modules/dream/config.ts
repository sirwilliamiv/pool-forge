// The whole state of somebody's dream backyard, and what counts as a valid one.
//
// This object is the studio's only state. It is what the sliders write, what
// the yard drawing reads, what the pricing runs on, and what travels in a
// shared link, so it is small on purpose: eleven fields, every one of them
// either a catalogue id or a bounded count.
//
// It is validated with Zod for the reason every boundary here is. A config
// arriving from a URL has been outside the process, and `catalog.ts` falls back
// to a default rather than throwing on an unknown id, which means without this
// schema a truncated link would silently price a different pool than the one
// somebody shared.

import { z } from 'zod'

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

/** The ids of a catalogue list, as a Zod enum. */
function idsOf(list: readonly ChoiceMeta[]): z.ZodEnum<[string, ...string[]]> {
  const ids = list.map((o) => o.id)
  const [first, ...rest] = ids
  if (first === undefined) throw new Error('empty catalogue list')
  return z.enum([first, ...rest])
}

export const dreamConfigSchema = z.object({
  shape: idsOf(POOL_SHAPES),
  size: idsOf(POOL_SIZES),
  depth: idsOf(DEPTH_PROFILES),
  finish: idsOf(INTERIOR_FINISHES),
  deckSize: idsOf(DECK_SIZES),
  deckMaterial: idsOf(DECK_MATERIALS),
  budget: idsOf(BUDGETS),
  spa: z.boolean(),
  heater: z.boolean(),
  saltwater: z.boolean(),
  screenEnclosure: z.boolean(),
  waterFeatures: z.number().int().min(0).max(MAX_WATER_FEATURES),
  /**
   * Lights *beyond* the ones the pool needs to be swum in after dark.
   *
   * Stored as an extra rather than a total so the baseline moves with the pool
   * size: somebody who picks an estate pool should not have to notice that
   * their two lights became inadequate.
   */
  extraLights: z.number().int().min(0).max(MAX_LIGHTS),
})

export type DreamConfig = z.infer<typeof dreamConfigSchema>

/**
 * Where everybody starts.
 *
 * A family-sized rectangle with a lounging deck: the pool most people are
 * picturing when they arrive, so the first number on screen is a number about
 * their pool rather than about a pool nobody wants. Extras are all off, because
 * the game is adding them.
 */
export const DEFAULT_DREAM: DreamConfig = {
  shape: 'rectangle',
  size: 'family',
  depth: 'standard',
  finish: 'plaster',
  deckSize: 'lounging',
  deckMaterial: 'concrete',
  budget: 'unknown',
  spa: false,
  heater: false,
  saltwater: false,
  screenEnclosure: false,
  waterFeatures: 0,
  extraLights: 0,
}

/**
 * Coerce anything into a config, falling back field by field.
 *
 * A shared link that has lost one character should open the backyard it can
 * still read rather than an error page: the visitor did not type the URL and
 * cannot fix it. Whole-object `safeParse` would throw away ten good fields to
 * punish one bad one, so each field falls back on its own.
 */
export function coerceDreamConfig(raw: unknown): DreamConfig {
  const parsed = dreamConfigSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const out: Record<string, unknown> = { ...DEFAULT_DREAM }

  for (const key of Object.keys(DEFAULT_DREAM)) {
    if (!(key in source)) continue
    const field = dreamConfigSchema.shape[key as keyof DreamConfig]
    const fieldResult = field.safeParse(source[key])
    if (fieldResult.success) out[key] = fieldResult.data
  }

  return dreamConfigSchema.parse(out)
}
