import { UnitType } from '@prisma/client'
import { z } from 'zod'

import type { Shape } from '@/modules/editor/state/shapes'
import { isPolygonPool, isPool } from '@/modules/editor/state/shapes'
import type { FinishSelection, PriceBookItemLite } from '@/modules/pricing/engine'
import {
  FINISH_SLOTS,
  SLOT_LABEL,
  SLOT_UNIT,
  UNIT_SUFFIX,
  UNIT_WORDS,
  type FinishSlot,
} from '@/modules/materials/slots'

export type { FinishSlot }
export { FINISH_SLOTS, SLOT_LABEL, SLOT_UNIT }

/**
 * `MaterialKind` as the client sees it, without importing the Prisma enum into
 * a bundle that has no business holding one.
 */
export type MaterialKindLite =
  | 'POOL_WATER'
  | 'CONCRETE_DECK'
  | 'PAVER_DECK'
  | 'GRASS'
  | 'COPING'
  | 'SCREEN'
  | 'LANAI'
  | 'CUSTOM'

/** A `Material` row as the editor page selects it. */
export interface MaterialRow {
  id: string
  kind: MaterialKindLite
  name: string
  fillSpec: unknown
}

/**
 * What a `Material.fillSpec` may say.
 *
 * Note what is *not* here: `costPerSqft` and `costPerLf`. Ten materials used to
 * carry their own prices — `PebbleTec — Cobalt $7.10/sqft`, `Travertine — Ivory
 * $28.00/lf` — none of which any quote had ever charged. Two price lists, and
 * the decorative one was the one the builder was reading over the customer's
 * shoulder. The price book is the only place money lives now; a material points
 * at the item that bills it and nothing else.
 *
 * Unknown keys are stripped rather than passed through, so a legacy row still
 * holding `costPerSqft` parses into a material with no price of its own.
 */
const fillSpecSchema = z.object({
  type: z.enum(['solid', 'gradient', 'mosaic']).catch('solid'),
  color: z.string().catch('#94A3B8'),
  secondary: z.string().optional(),
  brand: z.string().optional(),
  /**
   * Which pool surface this finish is for. Absent means it is a plain canvas
   * fill (water, grass, a deck surface) rather than something a builder picks
   * in the inspector.
   */
  slot: z.enum(FINISH_SLOTS).optional(),
  /** The `PriceBookItem` that bills this finish. Absent means the book has none. */
  priceItemId: z.string().optional(),
  /** The finish a pool gets when nobody has chosen one. At most one per slot. */
  isDefault: z.boolean().catch(false),
})

export type FillSpec = z.infer<typeof fillSpecSchema>

export interface CatalogMaterial {
  id: string
  kind: MaterialKindLite
  name: string
  brand: string | null
  /** CSS background for the swatch. */
  swatch: string
  /** The pool surface it finishes, or null when it is a plain fill. */
  slot: FinishSlot | null
  /** The price-book item it claims, or null. */
  priceItemId: string | null
  isDefault: boolean
}

/** What the price book charges for a finish, in the price book's own words. */
export interface FinishPrice {
  itemId: string
  itemName: string
  retailPrice: number
  unitType: UnitType
  /** e.g. "$42.00/lf" — retail, which is the number the quote bills. */
  label: string
}

export interface FinishOption {
  material: CatalogMaterial
  /** null when nothing in the price book bills this finish. */
  price: FinishPrice | null
  /** Why there is no price, in a sentence a builder can act on. */
  unpricedReason: string | null
}

export interface FinishCatalog {
  materials: CatalogMaterial[]
  /** One option per material that belongs to a slot. */
  options: FinishOption[]
  /**
   * Every price-book item some finish claims.
   *
   * An item on this list is billed only when its finish is the one chosen, so a
   * price book holding three copings bills the one running round the pool
   * rather than all three.
   */
  claimedItemIds: string[]
}

export const EMPTY_FINISH_CATALOG: FinishCatalog = {
  materials: [],
  options: [],
  claimedItemIds: [],
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function kindFallbackColor(kind: MaterialKindLite): string {
  switch (kind) {
    case 'POOL_WATER':
      return '#7DB9E8'
    case 'CONCRETE_DECK':
      return '#D9D6CF'
    case 'PAVER_DECK':
      return '#D6BFA0'
    case 'GRASS':
      return '#9CCC8E'
    case 'COPING':
      return '#A8A29E'
    default:
      return '#94A3B8'
  }
}

function darken(hex: string): string {
  const match = hex.match(/^#([0-9a-f]{6})$/i)
  const digits = match?.[1]
  if (!digits) return hex
  const n = parseInt(digits, 16)
  const r = Math.max(0, ((n >> 16) & 0xff) - 24)
  const g = Math.max(0, ((n >> 8) & 0xff) - 24)
  const b = Math.max(0, (n & 0xff) - 24)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

export function swatchFor(spec: FillSpec, kind: MaterialKindLite): string {
  const color = spec.color === '#94A3B8' ? kindFallbackColor(kind) : spec.color
  const secondary = spec.secondary ?? darken(color)
  if (spec.type === 'mosaic') {
    return `repeating-linear-gradient(45deg, ${color} 0 4px, ${secondary} 4px 8px)`
  }
  if (spec.type === 'gradient') {
    return `linear-gradient(135deg, ${color} 0%, ${secondary} 100%)`
  }
  return color
}

/** Parse one row's `fillSpec`, tolerating anything already in the column. */
export function parseMaterial(row: MaterialRow): CatalogMaterial {
  const spec = fillSpecSchema.parse(asRecord(row.fillSpec))
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    brand: spec.brand ?? null,
    swatch: swatchFor(spec, row.kind),
    slot: spec.slot ?? null,
    priceItemId: spec.priceItemId ?? null,
    isDefault: spec.isDefault,
  }
}

function money(value: number): string {
  return `$${value.toFixed(2)}`
}

/**
 * Resolve one finish against the price book.
 *
 * Three ways a finish ends up with no price, and each one says which:
 *
 *  - the material claims no item at all,
 *  - it claims an item this organisation's price book does not contain,
 *  - it claims an item sold in the wrong unit — a per-linear-foot tile band
 *    cannot price a per-square-foot interior finish, and converting one into
 *    the other would be inventing a number.
 *
 * In all three cases the option is still offered, still applies to the drawing,
 * and still prints on the packet. It simply does not pretend to a price.
 */
function priceFinish(
  material: CatalogMaterial,
  slot: FinishSlot,
  itemsById: ReadonlyMap<string, PriceBookItemLite>,
): { price: FinishPrice | null; unpricedReason: string | null } {
  if (material.priceItemId === null) {
    return {
      price: null,
      unpricedReason: 'Not in your price book — nothing is billed for this finish',
    }
  }
  const item = itemsById.get(material.priceItemId)
  if (!item) {
    return {
      price: null,
      unpricedReason: 'Not in your price book — nothing is billed for this finish',
    }
  }
  const wanted = SLOT_UNIT[slot]
  if (item.unitType !== wanted) {
    const has = UNIT_WORDS[item.unitType] ?? item.unitType.toLowerCase()
    const needs = UNIT_WORDS[wanted] ?? wanted.toLowerCase()
    return {
      price: null,
      unpricedReason: `Priced by the ${has}, but ${SLOT_LABEL[slot].toLowerCase()} is billed by the ${needs} — not billed`,
    }
  }
  return {
    price: {
      itemId: item.id,
      itemName: item.name,
      retailPrice: item.retailPrice,
      unitType: item.unitType,
      label: `${money(item.retailPrice)}/${UNIT_SUFFIX[item.unitType] ?? item.unitType.toLowerCase()}`,
    },
    unpricedReason: null,
  }
}

/**
 * The finish catalogue: the material list joined to the price book that bills it.
 *
 * Built once per request on the server and handed to the browser, so the panel
 * a builder reads and the quote it produces are two views of one join rather
 * than two lists that happen to have overlapping names.
 */
export function buildFinishCatalog(
  rows: readonly MaterialRow[],
  items: readonly PriceBookItemLite[],
): FinishCatalog {
  const itemsById = new Map(items.map((item) => [item.id, item]))
  const materials = rows.map(parseMaterial)
  const options: FinishOption[] = []
  const claimed = new Set<string>()
  for (const material of materials) {
    if (material.slot === null) continue
    const { price, unpricedReason } = priceFinish(material, material.slot, itemsById)
    if (price) claimed.add(price.itemId)
    options.push({ material, price, unpricedReason })
  }
  return { materials, options, claimedItemIds: [...claimed] }
}

export function optionsForSlot(catalog: FinishCatalog, slot: FinishSlot): FinishOption[] {
  return catalog.options.filter((option) => option.material.slot === slot)
}

export function optionFor(catalog: FinishCatalog, materialId: string): FinishOption | null {
  return catalog.options.find((option) => option.material.id === materialId) ?? null
}

export function materialFor(catalog: FinishCatalog, materialId: string): CatalogMaterial | null {
  return catalog.materials.find((material) => material.id === materialId) ?? null
}

/**
 * The finish a pool gets when nobody has chosen one.
 *
 * The default used to be "Pool Water", which is not a finish: it is the colour
 * the water is drawn in. A pool has a plaster or a pebble on it before anyone
 * picks an upgrade, so the default is the material the catalogue marks
 * `isDefault`, and failing that the cheapest one the price book can actually
 * bill.
 */
export function defaultOptionFor(catalog: FinishCatalog, slot: FinishSlot): FinishOption | null {
  const options = optionsForSlot(catalog, slot)
  const flagged = options.find((option) => option.material.isDefault)
  if (flagged) return flagged
  const priced = options
    .filter((option) => option.price !== null)
    .sort((a, b) => (a.price?.retailPrice ?? 0) - (b.price?.retailPrice ?? 0))
  return priced[0] ?? options[0] ?? null
}

/** The pool a finish belongs to. Finishes are pool surfaces; nothing else has them. */
function poolIn(shapes: readonly Shape[]): Shape | null {
  return shapes.find((shape) => isPool(shape) || isPolygonPool(shape)) ?? null
}

/**
 * What each pool surface is finished in, and what bills it.
 *
 * Returns nothing when there is no pool: a coping finish on a drawing with no
 * pool in it is not scope, and reporting it as unpriced would be noise.
 */
export function resolveFinishes(
  shapes: readonly Shape[],
  catalog: FinishCatalog,
): FinishSelection[] {
  const pool = poolIn(shapes)
  if (!pool) return []
  const out: FinishSelection[] = []
  for (const slot of FINISH_SLOTS) {
    const chosenId = pool.materials?.[slot]
    const chosen = chosenId ? optionFor(catalog, chosenId) : null
    const option = chosen?.material.slot === slot ? chosen : defaultOptionFor(catalog, slot)
    if (!option) continue
    out.push({
      slot,
      slotLabel: SLOT_LABEL[slot],
      materialId: option.material.id,
      materialName: option.material.name,
      priceItemId: option.price?.itemId ?? null,
    })
  }
  return out
}

/** The finish for one slot, for the inspector row that shows it. */
export function finishForSlot(
  finishes: readonly FinishSelection[],
  slot: FinishSlot,
): FinishSelection | null {
  return finishes.find((finish) => finish.slot === slot) ?? null
}
