import { UnitType } from '@prisma/client'

/**
 * The pool surfaces a builder picks a finish for.
 *
 * Three slots, and each one is measured in exactly one unit. That pairing is
 * the point of this file: the inspector used to build its interior-finish list
 * out of every material whose `kind` was CUSTOM, which put a waterline tile
 * sold at $15.00 per linear foot in the list of finishes billed by the square
 * foot. Nothing downstream could have caught it, because nothing downstream
 * knew what unit an interior finish is.
 */
export const FINISH_SLOTS = ['interior', 'coping', 'tileBand'] as const

export type FinishSlot = (typeof FINISH_SLOTS)[number]

/** What the slot is called on screen and on the printed sheets. */
export const SLOT_LABEL: Record<FinishSlot, string> = {
  interior: 'Interior finish',
  coping: 'Coping',
  tileBand: 'Waterline tile',
}

/**
 * The unit the slot is billed in.
 *
 * A price-book item whose `unitType` disagrees with this cannot price the slot,
 * and `buildFinishCatalog` refuses to quote it rather than converting square
 * feet into linear feet behind the builder's back.
 */
export const SLOT_UNIT: Record<FinishSlot, UnitType> = {
  interior: UnitType.SQFT,
  coping: UnitType.LF,
  tileBand: UnitType.LF,
}

/** The unit in words, for a sentence a builder reads. */
export const UNIT_WORDS: Partial<Record<UnitType, string>> = {
  [UnitType.SQFT]: 'square foot',
  [UnitType.LF]: 'linear foot',
  [UnitType.EACH]: 'unit',
  [UnitType.LUMP]: 'job',
  [UnitType.CUYD]: 'cubic yard',
  [UnitType.HOUR]: 'hour',
}

/** Short unit suffix for a price label, e.g. "$42.00/lf". */
export const UNIT_SUFFIX: Partial<Record<UnitType, string>> = {
  [UnitType.SQFT]: 'sqft',
  [UnitType.LF]: 'lf',
  [UnitType.EACH]: 'ea',
  [UnitType.LUMP]: 'job',
  [UnitType.CUYD]: 'cu yd',
  [UnitType.HOUR]: 'hr',
}

export function isFinishSlot(value: unknown): value is FinishSlot {
  return typeof value === 'string' && (FINISH_SLOTS as readonly string[]).includes(value)
}
