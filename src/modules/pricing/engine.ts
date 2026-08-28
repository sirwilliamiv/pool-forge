import { PriceCategory, UnitType } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import type { FinishSlot } from '@/modules/materials/slots'

export { PriceCategory, UnitType }

export interface PriceBookItemLite {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: number
  /** Required count-unit items are forced onto the quote at qty 1 (e.g. the pump). */
  required?: boolean
  /**
   * The customer selection that switches this line on. See `PricingOptionKey`.
   *
   * Null or empty means "billed by this item's category rule", which is what
   * every book held before the column existed.
   */
  optionKey?: string | null
}

/** A `PriceBookItem` row as Prisma returns it (`retailPrice` is a Decimal). */
export interface PriceBookItemRow {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  retailPrice: unknown
  required?: boolean
  optionKey?: string | null
}

/**
 * Map price-book rows to the engine's input shape. Call sites used to inline
 * this and kept forgetting `required`, which silently dropped every required
 * line (the seeded VS pump) from the quote.
 */
export function toPriceBookItems(rows: readonly PriceBookItemRow[]): PriceBookItemLite[] {
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    unitType: r.unitType,
    retailPrice: Number(r.retailPrice) || 0,
    required: r.required ?? false,
    optionKey: r.optionKey ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Options: which customer choice turns a price-book line on.
// ---------------------------------------------------------------------------

/**
 * The customer selections a price-book line can name.
 *
 * Every EQUIPMENT item used to be gated by a single flag meaning "a heater OR a
 * salt system was chosen", and the engine handed that one answer to every item
 * in the category. A book holding a $5,800 heater and a $2,200 salt cell
 * therefore billed both the moment a customer asked for either, and somebody
 * who wanted salt was charged for a heater on a proposal whose own equipment
 * schedule said "Heater: not included".
 *
 * A line names the thing it belongs to now.
 */
export const PRICING_OPTIONS = ['heater', 'salt', 'screen'] as const

export type PricingOptionKey = (typeof PRICING_OPTIONS)[number]

const OPTION_LABELS: Record<PricingOptionKey, string> = {
  heater: 'Heater',
  salt: 'Salt system',
  screen: 'Screen enclosure',
}

/** The user-facing name of an option. Never print the raw key. */
export function optionLabel(key: PricingOptionKey): string {
  return OPTION_LABELS[key]
}

/** Where an option's money lives, so a missing one can be reported precisely. */
const OPTION_CATEGORY: Record<PricingOptionKey, PriceCategory> = {
  heater: PriceCategory.EQUIPMENT,
  salt: PriceCategory.EQUIPMENT,
  screen: PriceCategory.SCREEN,
}

// Spellings a builder plausibly types or an import plausibly carries. The
// price-book form offers the three keys as a list, so this only has to absorb
// what arrives from an import or a direct write.
const OPTION_SYNONYMS: Readonly<Record<string, PricingOptionKey>> = {
  heater: 'heater',
  heat: 'heater',
  heating: 'heater',
  heatpump: 'heater',
  gasheater: 'heater',
  salt: 'salt',
  saltsystem: 'salt',
  saltcell: 'salt',
  saltwater: 'salt',
  saltchlorinator: 'salt',
  chlorinator: 'salt',
  screen: 'screen',
  screenenclosure: 'screen',
  enclosure: 'screen',
  cage: 'screen',
}

/**
 * The option a stored key means, or null if it names nothing this app asks for.
 *
 * Null is not "no gate": a key nobody can select is reported rather than
 * quietly falling back to the category rule, because a line that bills on a
 * question the customer was never asked is the bug this column exists to fix.
 */
export function normalizeOptionKey(raw: string | null | undefined): PricingOptionKey | null {
  if (raw === null || raw === undefined) return null
  const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (cleaned === '') return null
  return OPTION_SYNONYMS[cleaned] ?? null
}

/** Does this item carry an option key at all? */
function isGated(item: PriceBookItemLite): boolean {
  return (item.optionKey ?? '').trim() !== ''
}

type OptionGate = 'ungated' | 'on' | 'off' | 'unknown'

function optionChosen(key: PricingOptionKey, sel: PricingSelections): boolean {
  switch (key) {
    case 'heater':
      return sel.heaterSelected === true
    case 'salt':
      return sel.saltSystemSelected === true
    case 'screen':
      return sel.screenSelected === true
  }
}

function optionGate(item: PriceBookItemLite, sel: PricingSelections): OptionGate {
  if (!isGated(item)) return 'ungated'
  const key = normalizeOptionKey(item.optionKey)
  if (key === null) return 'unknown'
  return optionChosen(key, sel) ? 'on' : 'off'
}

// ---------------------------------------------------------------------------
// Per-job line items: money nothing in a drawing measures.
// ---------------------------------------------------------------------------

/**
 * An amount a builder put on one job by hand.
 *
 * Five price categories — lanai, fence, wall, electrical and other — have no
 * measurement behind them: no drawing says how many feet of fence or what the
 * permit costs. They were accepted into the price book, listed there, and then
 * absent from every quote, because the engine asked their category for a
 * quantity and the category answered zero. A builder typed "Paver retaining
 * wall $9,400", watched it save, and sent a proposal without it.
 *
 * These are per-job amounts rather than catalogue lines, so the builder says
 * how many. A line item may be copied out of the price book (`priceBookItemId`
 * records where it came from) or typed as a one-off.
 */
export interface ProjectLineItemLite {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  quantity: number
  unitPrice: number
  note?: string | null
}

/** A `ProjectLineItem` row as Prisma returns it (the numbers are Decimals). */
export interface ProjectLineItemRow {
  id: string
  category: PriceCategory
  name: string
  unitType: UnitType
  quantity: unknown
  unitPrice: unknown
  note?: string | null
}

export function toProjectLineItems(
  rows: readonly ProjectLineItemRow[],
): ProjectLineItemLite[] {
  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    unitType: r.unitType,
    quantity: Number(r.quantity) || 0,
    unitPrice: Number(r.unitPrice) || 0,
    note: r.note ?? null,
  }))
}

/**
 * A finish chosen for one pool surface, and the price-book item that bills it.
 *
 * `priceItemId` is nullable on purpose. A finish the price book cannot bill is
 * a real answer — the builder picked a material their book has no line for —
 * and the honest thing to do with it is to say so on the quote. Pricing it
 * silently at whatever the base pool line happens to charge is what the
 * material picker used to do, and it meant a $7.10 finish and a $15.75 finish
 * produced the same total.
 */
export interface FinishSelection {
  slot: FinishSlot
  /** Human label of the slot, e.g. "Interior finish". Never the raw key. */
  slotLabel: string
  materialId: string
  materialName: string
  priceItemId: string | null
}

export interface PricingSelections {
  heaterSelected?: boolean
  saltSystemSelected?: boolean
  screenSelected?: boolean
  lightingQuantity?: number
  /** What each pool surface is finished in. See `FinishSelection`. */
  finishes?: readonly FinishSelection[]
  /**
   * Every price-book item that some material in the finish catalogue claims.
   *
   * An item named here bills only when its material is the one chosen. Without
   * this, a price book holding three copings would bill all three the moment a
   * pool had a perimeter, because the engine prices by category and a category
   * cannot tell one travertine from another.
   */
  finishItemIds?: readonly string[]
  /**
   * Amounts put on this job by hand. See `ProjectLineItemLite`.
   *
   * They sit here rather than alongside the price book because they are not
   * catalogue: they belong to one project, they carry their own quantity, and
   * nothing measures them.
   */
  projectLineItems?: readonly ProjectLineItemLite[]
}

export interface QuoteLine {
  itemId: string
  name: string
  category: PriceCategory
  source: string
  quantity: number
  unitPrice: number
  total: number
}

/**
 * Why a quote has no money in it.
 *
 * A quote that cannot be computed must say so rather than print a plausible
 * figure: an empty canvas that quoted the required pump read as "$1,855 for
 * nothing", and an organisation with no price book quoted every job at $0.
 */
export type QuoteStatus =
  /** There is a drawing and a price book; the figures below are real. */
  | 'PRICED'
  /** Nothing has been drawn, so there is nothing to price. */
  | 'NOTHING_DRAWN'
  /** Something is drawn but the organisation has no active price book. */
  | 'NO_PRICE_BOOK'

/**
 * Scope that is present in the drawing but that the price book cannot price.
 *
 * Surfaced to the user instead of being silently omitted: a waterfall that adds
 * nothing to the total is either a missing price-book row or a mistake, and
 * either way the person quoting needs to know before they send it.
 */
export interface UnpricedScope {
  category: PriceCategory
  /** Human label, e.g. "Water features". Never a raw enum. */
  label: string
  quantity: number
  unit: string
  reason: string
  /**
   * How wide the claim is.
   *
   * `'category'` says the whole category is unpriced, so nothing in it may be
   * billing at the same time. `'detail'` names one specific thing inside a
   * category that is otherwise perfectly well priced: a finish the book has no
   * row for, two items fighting over one measurement, an option the book
   * cannot bill. A pool with an unbillable interior still has a pool shell
   * line, and both statements are true at once.
   *
   * Written down rather than inferred so the invariant "never says a category
   * is unpriced while billing for it" can be stated without a text match.
   */
  scope: 'category' | 'detail'
}

export interface QuoteSummary {
  status: QuoteStatus
  lineItems: QuoteLine[]
  subtotal: number
  taxRatePct: number
  taxAmount: number
  total: number
  unpriced: UnpricedScope[]
}

export interface QuoteOptions {
  /** Sales-tax rate applied to the subtotal, as a percentage (e.g. 6 for 6%). */
  taxRatePct?: number
}

interface QuantityResult {
  quantity: number
  source: string
}

/**
 * Is there anything in this drawing worth billing for?
 *
 * The gate that stops an empty canvas quoting money. Required price-book items
 * (the pump) are forced onto real jobs, and a job with nothing in it is not a
 * real job.
 */
export function hasBillableScope(m: MeasurementSummary): boolean {
  return (
    m.hasPool ||
    m.hasDeck ||
    m.poolSurfaceArea > 0 ||
    m.deckArea > 0 ||
    m.spaCount > 0 ||
    m.featureCount > 0 ||
    m.copingLinearFeet > 0 ||
    m.decoDrainLinearFeet > 0 ||
    m.benchLinearFeet > 0 ||
    m.lightCount > 0 ||
    m.waterFeatureCount > 0 ||
    m.cutYards > 0 ||
    m.fillYards > 0
  )
}

/**
 * The lighting count the quote actually bills.
 *
 * Lights placed on the canvas win over the number typed into the project form:
 * the drawing is the thing the customer is buying. The form only speaks when
 * nothing is drawn, which is how a quote can be built before the design is.
 */
export function effectiveLightingQuantity(
  m: MeasurementSummary,
  sel: PricingSelections,
): number {
  return m.lightCount > 0 ? m.lightCount : Math.max(0, sel.lightingQuantity ?? 0)
}

// Map a price-book item to a quantity by dispatching on its category + unit
// type enums. No string matching — every line goes through a typed branch.
function quantityForItem(
  item: PriceBookItemLite,
  m: MeasurementSummary,
  sel: PricingSelections,
): QuantityResult {
  switch (item.category) {
    case PriceCategory.EARTHWORK:
      // Cut and fill are different jobs at different rates, so the unit decides
      // which one this line is selling. A cubic-yard line with no grade prices
      // at zero rather than guessing a volume.
      if (item.unitType === UnitType.CUYD) {
        const isFill = /\bfill|import|bring in\b/i.test(item.name)
        return isFill
          ? { quantity: m.fillYards, source: 'Fill volume' }
          : { quantity: m.cutYards, source: 'Cut volume' }
      }
      return {
        quantity: m.cutYards + m.fillYards > 0 ? 1 : 0,
        source: 'Earthwork present',
      }
    case PriceCategory.POOL:
      if (item.unitType === UnitType.SQFT) {
        return { quantity: m.poolSurfaceArea, source: 'Pool surface area' }
      }
      // Waterline tile is a pool line sold by the foot, and the foot it is sold
      // by is the pool's own edge. Before this branch existed a per-linear-foot
      // pool item priced at qty 1, so a $15/lf tile band billed $15 for the job.
      if (item.unitType === UnitType.LF) {
        return { quantity: m.copingLinearFeet, source: 'Pool perimeter' }
      }
      return { quantity: m.hasPool ? 1 : 0, source: 'Pool present' }
    case PriceCategory.SPA:
      return { quantity: m.spaCount > 0 ? 1 : 0, source: 'Spa present' }
    case PriceCategory.DECK:
      return { quantity: m.deckArea, source: 'Deck area' }
    case PriceCategory.LANAI:
      return { quantity: 0, source: 'Lanai area' }
    case PriceCategory.COPING:
      return { quantity: m.copingLinearFeet, source: 'Pool perimeter' }
    case PriceCategory.DRAIN:
      return { quantity: m.decoDrainLinearFeet, source: 'Deco drain length' }
    case PriceCategory.BENCH:
      return { quantity: m.benchLinearFeet, source: 'Bench length' }
    case PriceCategory.EQUIPMENT:
      // The fallback for an item that names no option: it bills when the
      // customer asked for equipment at all. `computeQuote` gates anything
      // carrying an `optionKey` on that option alone, which is how a heater
      // and a salt cell in one book stop billing as a pair.
      return {
        quantity: sel.heaterSelected || sel.saltSystemSelected ? 1 : 0,
        source: 'Equipment selection',
      }
    case PriceCategory.LIGHTING:
      return {
        quantity: effectiveLightingQuantity(m, sel),
        source: m.lightCount > 0 ? 'Lights in drawing' : 'Lighting selection',
      }
    case PriceCategory.WATER_FEATURE:
      // Priced per placed feature. Area / linear water-feature items price at
      // zero rather than inventing a size for a waterfall.
      return COUNT_UNIT_TYPES.has(item.unitType)
        ? { quantity: m.waterFeatureCount, source: 'Water features in drawing' }
        : { quantity: 0, source: 'Manual' }
    case PriceCategory.SCREEN:
      // A cage is not a deck. This used to bill deck area, which is neither the
      // footprint a cage covers (it spans the pool as well) nor the thing a
      // screen contractor charges by (panel and mesh area over a footprint,
      // with a roof style and a height), and nothing in the drawing measures
      // either. A 770 sq ft deck therefore invoiced 770 sq ft of screen at the
      // per-square-foot rate, and the figure was wrong in both directions
      // depending on the yard.
      //
      // A cage sold as one thing bills as one thing. A cage sold by the square
      // foot cannot be measured here, so it bills nothing and the quote says
      // so, exactly as an unpriceable waterfall does.
      if (!sel.screenSelected) return { quantity: 0, source: 'Screen not selected' }
      return COUNT_UNIT_TYPES.has(item.unitType)
        ? { quantity: 1, source: 'Screen enclosure selected' }
        : { quantity: 0, source: 'Cage not measured by the drawing' }
    case PriceCategory.FENCE:
    case PriceCategory.WALL:
    case PriceCategory.ELECTRICAL:
    case PriceCategory.MISC:
      return { quantity: 0, source: 'Manual' }
  }
}

// Unit types that represent a discrete count / flat charge (not an area or
// linear measurement). A `required` item of one of these types is forced onto
// the quote at qty 1 even when its category rule yields 0 — e.g. a required
// variable-speed pump must appear whether or not a heater is selected. Area /
// linear required items are left at 0 so we never invent surface area.
const COUNT_UNIT_TYPES: ReadonlySet<UnitType> = new Set([
  UnitType.EACH,
  UnitType.LUMP,
  UnitType.HOUR,
])

const CATEGORY_LABELS: Record<PriceCategory, string> = {
  [PriceCategory.EARTHWORK]: 'Earthwork',
  [PriceCategory.POOL]: 'Pool shell',
  [PriceCategory.SPA]: 'Spa',
  [PriceCategory.DECK]: 'Deck',
  [PriceCategory.LANAI]: 'Lanai',
  [PriceCategory.COPING]: 'Coping',
  [PriceCategory.DRAIN]: 'Deco drain',
  [PriceCategory.BENCH]: 'Benches',
  [PriceCategory.EQUIPMENT]: 'Equipment',
  [PriceCategory.LIGHTING]: 'Lighting',
  [PriceCategory.WATER_FEATURE]: 'Water features',
  [PriceCategory.SCREEN]: 'Screen enclosure',
  [PriceCategory.FENCE]: 'Fence',
  [PriceCategory.WALL]: 'Walls',
  [PriceCategory.ELECTRICAL]: 'Electrical',
  [PriceCategory.MISC]: 'Other',
}

/** The user-facing name of a price-book category. Never print the raw enum. */
export function categoryLabel(category: PriceCategory): string {
  return CATEGORY_LABELS[category]
}

/** Scope present in the drawing, in the units the person reads it in. */
function scopePresent(
  m: MeasurementSummary,
  sel: PricingSelections,
): Array<{ category: PriceCategory; quantity: number; unit: string }> {
  return [
    { category: PriceCategory.POOL, quantity: m.poolSurfaceArea, unit: 'sq ft' },
    { category: PriceCategory.SPA, quantity: m.spaCount, unit: 'placed' },
    { category: PriceCategory.DECK, quantity: m.deckArea, unit: 'sq ft' },
    { category: PriceCategory.COPING, quantity: m.copingLinearFeet, unit: 'LF' },
    { category: PriceCategory.DRAIN, quantity: m.decoDrainLinearFeet, unit: 'LF' },
    { category: PriceCategory.BENCH, quantity: m.benchLinearFeet, unit: 'LF' },
    { category: PriceCategory.LIGHTING, quantity: effectiveLightingQuantity(m, sel), unit: 'placed' },
    { category: PriceCategory.WATER_FEATURE, quantity: m.waterFeatureCount, unit: 'placed' },
    { category: PriceCategory.EARTHWORK, quantity: m.cutYards + m.fillYards, unit: 'cu yd' },
  ]
  // EQUIPMENT and SCREEN are deliberately absent: both are driven by a customer
  // choice rather than by a measurement, and `unpricedOptions` reports them one
  // option at a time. "Equipment is unpriced" was never something a builder
  // could act on when the missing thing was the salt cell and the pump was
  // billing perfectly well beside it.
}

/**
 * An option the customer asked for that no price-book line bills.
 *
 * Reported per option rather than per category, because the category is
 * usually priced: a job with a pump on it has an EQUIPMENT line whatever else
 * is missing, so nothing at the category level looks wrong while the salt
 * system the customer chose adds nothing to the total.
 */
function unpricedOptions(
  items: readonly PriceBookItemLite[],
  lineItems: readonly QuoteLine[],
  sel: PricingSelections,
): UnpricedScope[] {
  const keyOf = new Map(items.map((i) => [i.id, normalizeOptionKey(i.optionKey)]))
  // Categories where the book has started naming options. Once one item in a
  // category says which option it belongs to, an option is covered only by a
  // line that names it. Until then the old behaviour stands and any line in the
  // category counts, so a book nobody has keyed yet raises no new warnings.
  const keyed = new Set(items.filter(isGated).map((i) => i.category))

  const out: UnpricedScope[] = []
  for (const key of PRICING_OPTIONS) {
    if (!optionChosen(key, sel)) continue
    const category = OPTION_CATEGORY[key]
    const label = OPTION_LABELS[key]
    const billing = lineItems.filter((line) => line.category === category)
    const covered = keyed.has(category)
      ? billing.some((line) => keyOf.get(line.itemId) === key)
      : billing.length > 0
    if (covered) continue

    out.push({
      category,
      scope: 'detail',
      label,
      quantity: 1,
      unit: 'selected',
      reason: optionReason(key, items),
    })
  }
  return out
}

function optionReason(key: PricingOptionKey, items: readonly PriceBookItemLite[]): string {
  const label = OPTION_LABELS[key].toLowerCase()
  const category = OPTION_CATEGORY[key]
  const inBook = items.some((i) => i.category === category)
  if (!inBook) {
    return `The customer asked for a ${label} and the price book has no ${categoryLabel(
      category,
    ).toLowerCase()} item, so nothing is billed for it`
  }
  if (key === 'screen') {
    return 'The customer asked for a screen enclosure, and a cage is not measured by the drawing. Price it as a single item, or add the cage to this job as a line item with the square footage you measured'
  }
  return `The customer asked for a ${label} and no price-book item bills one, so nothing is charged for it`
}

/**
 * A hand-entered amount that would add nothing, named rather than dropped.
 *
 * The bug this whole model exists for is a line a builder entered and never saw
 * again. A line item at zero quantity must not repeat it quietly.
 */
function unpricedLineItems(added: readonly ProjectLineItemLite[]): UnpricedScope[] {
  const out: UnpricedScope[] = []
  for (const item of added) {
    if (item.quantity > 0) continue
    out.push({
      category: item.category,
      scope: 'detail',
      label: item.name,
      quantity: 0,
      unit: unitLabel(item.unitType),
      reason: 'This was added to the job at a quantity of zero, so it bills nothing. Set a quantity and it will be charged',
    })
  }
  return out
}

const UNIT_LABELS: Record<UnitType, string> = {
  [UnitType.SQFT]: 'sq ft',
  [UnitType.LF]: 'LF',
  [UnitType.EACH]: 'each',
  [UnitType.LUMP]: 'lump sum',
  [UnitType.HOUR]: 'hours',
  [UnitType.CUYD]: 'cu yd',
}

/** The user-facing name of a unit type. Never print the raw enum. */
export function unitLabel(unitType: UnitType): string {
  return UNIT_LABELS[unitType]
}

/**
 * How much of the drawing a finish covers, in the unit its slot is billed in.
 * Only used to report a finish the price book cannot bill.
 */
function finishQuantity(
  slot: FinishSlot,
  m: MeasurementSummary,
): { quantity: number; unit: string } {
  return slot === 'interior'
    ? { quantity: m.poolSurfaceArea, unit: 'sq ft' }
    : { quantity: m.copingLinearFeet, unit: 'LF' }
}

/**
 * Finishes chosen that no price-book item bills.
 *
 * Reported by name and by slot rather than folded into the category-level
 * report, because the category is usually priced: a pool with a finish the book
 * has no line for still has a `Pool Base` line, so nothing at the category
 * level looks wrong. The builder has to be told which finish is free.
 */
function unpricedFinishes(m: MeasurementSummary, sel: PricingSelections): UnpricedScope[] {
  const out: UnpricedScope[] = []
  for (const finish of sel.finishes ?? []) {
    if (finish.priceItemId !== null) continue
    const { quantity, unit } = finishQuantity(finish.slot, m)
    if (quantity <= 0) continue
    out.push({
      category: finish.slot === 'coping' ? PriceCategory.COPING : PriceCategory.POOL,
      scope: 'detail',
      label: `${finish.slotLabel} — ${finish.materialName}`,
      quantity: Math.round(quantity * 100) / 100,
      unit,
      reason: 'This finish has no price-book item, so nothing is billed for it',
    })
  }
  return out
}


/**
 * Tell the builder which of their own items collided.
 *
 * Named rather than counted, because "two deck items" is not actionable and
 * "Concrete Deck and Paver Deck" is: it points at the two rows to go and fix.
 */
function collisionScope(
  collisions: readonly Collision[],
  m: MeasurementSummary,
  sel: PricingSelections,
): UnpricedScope[] {
  if (collisions.length === 0) return []
  const scopes = new Map(scopePresent(m, sel).map((scope) => [scope.category, scope]))

  return collisions.map((collision) => {
    const scope = scopes.get(collision.category)
    const label = categoryLabel(collision.category)
    return {
      category: collision.category,
      scope: 'detail' as const,
      label,
      quantity: scope ? Math.round(scope.quantity * 100) / 100 : 0,
      unit: scope?.unit ?? '',
      reason: `${collision.names.join(' and ')} would both bill this ${label.toLowerCase()}. Mark one as the default, or remove one, and it will be priced.`,
    }
  })
}

function unpricedScope(
  items: readonly PriceBookItemLite[],
  lineItems: readonly QuoteLine[],
  m: MeasurementSummary,
  sel: PricingSelections,
  /** Categories a collision already explains, so one gap is not reported twice. */
  explained: ReadonlySet<PriceCategory> = new Set(),
): UnpricedScope[] {
  const pricedCategories = new Set(lineItems.map((l) => l.category))
  const bookCategories = new Set(items.map((i) => i.category))
  const out: UnpricedScope[] = unpricedFinishes(m, sel)
  for (const scope of scopePresent(m, sel)) {
    if (scope.quantity <= 0) continue
    if (pricedCategories.has(scope.category)) continue
    // A category with two items fighting over it is not a category the book is
    // missing, and saying both would give the builder contradictory reasons for
    // the same blank line.
    if (explained.has(scope.category)) continue
    const label = categoryLabel(scope.category)
    out.push({
      category: scope.category,
      scope: 'category',
      label,
      quantity: Math.round(scope.quantity * 100) / 100,
      unit: scope.unit,
      reason: bookCategories.has(scope.category)
        ? `The price book has no ${label.toLowerCase()} item that fits this drawing`
        : `No ${label.toLowerCase()} item in the price book`,
    })
  }
  return out
}

function emptyQuote(status: QuoteStatus, taxRatePct: number, unpriced: UnpricedScope[] = []): QuoteSummary {
  return {
    status,
    lineItems: [],
    subtotal: 0,
    taxRatePct,
    taxAmount: 0,
    total: 0,
    unpriced,
  }
}


/**
 * Categories where several items on one job is normal.
 *
 * A pump, a heater and a salt cell are three pieces of equipment, not three
 * ways of doing the same thing, and the same goes for a panel and a bonding
 * grid. Everywhere else the category hands the same measured quantity to every
 * item in it, so two items means the same ground billed twice.
 */
export const ADDITIVE_CATEGORIES: ReadonlySet<PriceCategory> = new Set([
  PriceCategory.EQUIPMENT,
  PriceCategory.ELECTRICAL,
  PriceCategory.FENCE,
  PriceCategory.WALL,
  PriceCategory.MISC,
])

interface Collision {
  category: PriceCategory
  names: string[]
}

/**
 * Stop two items billing one measurement, without guessing which the builder meant.
 *
 * The engine prices by category: it asks the category for a quantity and hands
 * that same quantity to every item in it. So a price book with a concrete deck
 * and a paver deck billed 1,540 square feet of deck for a 770 square foot deck,
 * and the builder found out when the job came back underbid, or did not find
 * out at all.
 *
 * Where the customer has chosen, the choice decides it: an item claimed by a
 * material and not selected has already been zeroed by the time this runs.
 * Where the book names a default with `required`, that decides it. Where
 * neither is true the answer is genuinely unknown, so nothing in that category
 * bills and the quote says which items collided. A number that is too high is
 * the harm here, and a visible gap is recoverable in a way a silently doubled
 * line is not.
 */
function resolveAlternatives(
  lines: QuoteLine[],
  items: readonly PriceBookItemLite[],
  claimedByAFinish: ReadonlySet<string>,
): Collision[] {
  const required = new Set(items.filter((i) => i.required).map((i) => i.id))
  const unitOf = new Map(items.map((i) => [i.id, i.unitType]))
  const byCategory = new Map<string, QuoteLine[]>()

  for (const line of lines) {
    if (line.quantity <= 0) continue
    if (ADDITIVE_CATEGORIES.has(line.category)) continue
    // An item a material claims is already governed by which finish was
    // picked, and it sits alongside the thing it finishes rather than
    // competing with it: a pool base and a pool interior are both POOL and are
    // both genuinely on the job.
    if (claimedByAFinish.has(line.itemId)) continue

    // Category and unit together, because that is what decides the quantity an
    // item receives. A per-square-foot pool base and a per-linear-foot tile
    // band are both POOL and are measured along different things, so they were
    // never competing for the same number.
    const key = `${line.category}:${unitOf.get(line.itemId) ?? ''}`
    const group = byCategory.get(key) ?? []
    group.push(line)
    byCategory.set(key, group)
  }

  const collisions: Collision[] = []

  for (const group of byCategory.values()) {
    if (group.length < 2) continue
    const category = group[0]!.category

    const defaults = group.filter((line) => required.has(line.itemId))
    const winner = defaults.length === 1 ? defaults[0] : undefined

    for (const line of group) {
      if (line === winner) continue
      line.quantity = 0
      line.total = 0
      line.source = winner ? 'Alternative not selected' : 'Two items compete'
    }

    if (!winner) {
      collisions.push({ category, names: group.map((line) => line.name).sort() })
    }
  }

  return collisions
}

export function computeQuote(
  items: PriceBookItemLite[],
  measurements: MeasurementSummary,
  selections: PricingSelections = {},
  options: QuoteOptions = {},
): QuoteSummary {
  const taxRatePct = Math.max(0, options.taxRatePct ?? 0)
  const added = selections.projectLineItems ?? []
  const drawn = hasBillableScope(measurements)

  // Nothing drawn is not "$0 of work agreed", it is "no answer yet". Return
  // before any required item is forced onto the sheet.
  //
  // An amount somebody typed onto this job is scope, though, whether or not
  // anything has been drawn: a builder who has entered a $2,000 permit fee and
  // no design has told us about $2,000 of work.
  if (!drawn && added.length === 0) {
    return emptyQuote('NOTHING_DRAWN', taxRatePct)
  }

  // A drawing with no price book behind it cannot be priced at all. Quoting it
  // at $0 told twenty-one projects in this database that they were free.
  // Hand-entered lines carry their own price, so they still bill.
  if (items.length === 0 && added.length === 0) {
    return emptyQuote(
      'NO_PRICE_BOOK',
      taxRatePct,
      unpricedScope([], [], measurements, selections),
    )
  }

  // Which price-book items belong to a finish, and which of those was picked.
  // An item claimed by the catalogue and not picked bills nothing at all: it is
  // an alternative the customer did not choose, not scope on this job.
  const claimedByAFinish = new Set(selections.finishItemIds ?? [])
  const chosenFinishItems = new Set(
    (selections.finishes ?? [])
      .map((finish) => finish.priceItemId)
      .filter((id): id is string => id !== null),
  )

  const priced: QuoteLine[] = items
    .map<QuoteLine>((item) => {
      const derived = quantityForItem(item, measurements, selections)
      let quantity = derived.quantity
      let source = derived.source
      // Only onto a job that has a design in it. A permit fee typed against an
      // empty canvas is scope, and it must not drag the required pump on with
      // it: "$1,855 for nothing" is the defect the drawn-scope gate exists to
      // stop, and it would have come back through this door.
      if (drawn && item.required && quantity <= 0 && COUNT_UNIT_TYPES.has(item.unitType)) {
        quantity = 1
        source = 'Required'
      }
      // The option gate runs after `required`, so it wins over it. A line that
      // names the heater is not on this job when the customer did not ask for a
      // heater, however the book has it flagged: "required" means "the default
      // when this applies", and this does not apply.
      const gate = optionGate(item, selections)
      if (gate === 'off') {
        quantity = 0
        const key = normalizeOptionKey(item.optionKey)
        source = key ? `${OPTION_LABELS[key]} not selected` : 'Option not selected'
      } else if (gate === 'unknown') {
        // A key nobody can tick. Zeroed rather than billed, and reported below
        // by name, because a line switched on by a question the customer is
        // never asked is the defect this column was added to end.
        quantity = 0
        source = 'Option not offered'
      }
      if (claimedByAFinish.has(item.id) && !chosenFinishItems.has(item.id)) {
        quantity = 0
        source = 'Finish not selected'
      } else if (chosenFinishItems.has(item.id)) {
        source = 'Selected finish'
      }
      // Round the quantity first, then derive the line total from the rounded
      // quantity so `quantity × unitPrice` always equals the printed line total.
      const roundedQty = Math.round(quantity * 100) / 100
      const unitPrice = Number(item.retailPrice) || 0
      return {
        itemId: item.id,
        name: item.name,
        category: item.category,
        source,
        quantity: roundedQty,
        unitPrice,
        total: Math.round(roundedQty * unitPrice * 100) / 100,
      }
    })

  // Before anything is added up: two items cannot bill one measurement.
  const collisions = resolveAlternatives(priced, items, claimedByAFinish)

  // Hand-entered lines join after the collision pass rather than during it.
  // Nothing here is competing for a measurement: the builder said what it is,
  // how many, and what it costs, and two retaining walls on one job are two
  // walls. Running them through the alternatives rule would suspend the second
  // one for looking like the first.
  const addedLines: QuoteLine[] = added.map((line) => {
    // Three decimals because that is what the column holds; the total is
    // derived from the rounded quantity so `quantity × unit price` still
    // reconciles against the printed figure.
    const quantity = Math.round(Math.max(0, line.quantity) * 1000) / 1000
    const unitPrice = Math.max(0, Number(line.unitPrice) || 0)
    return {
      itemId: line.id,
      name: line.name,
      category: line.category,
      source: 'Added to this job',
      quantity,
      unitPrice,
      total: Math.round(quantity * unitPrice * 100) / 100,
    }
  })

  const lineItems = [...priced.filter((l) => l.quantity > 0), ...addedLines.filter((l) => l.quantity > 0)]

  const subtotal = Math.round(lineItems.reduce((sum, l) => sum + l.total, 0) * 100) / 100
  const taxAmount = Math.round(subtotal * (taxRatePct / 100) * 100) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100
  return {
    status: 'PRICED',
    lineItems,
    subtotal,
    taxRatePct,
    taxAmount,
    total,
    unpriced: [
      ...unpricedScope(
        items,
        lineItems,
        measurements,
        selections,
        new Set(collisions.map((c) => c.category)),
      ),
      ...unpricedOptions(items, lineItems, selections),
      ...unofferedOptions(items),
      ...unpricedLineItems(added),
      ...collisionScope(collisions, measurements, selections),
    ],
  }
}

/**
 * Price-book lines keyed to an option the app never asks about.
 *
 * The price-book form offers the three real options as a list, so this should
 * be empty for anything a builder typed. It is here for what arrives another
 * way — a spreadsheet import, a script — because the alternative is a line that
 * sits in the book billing nothing and saying nothing about why.
 */
function unofferedOptions(items: readonly PriceBookItemLite[]): UnpricedScope[] {
  const out: UnpricedScope[] = []
  for (const item of items) {
    if (!isGated(item)) continue
    if (normalizeOptionKey(item.optionKey) !== null) continue
    out.push({
      category: item.category,
      scope: 'detail',
      label: item.name,
      quantity: 0,
      unit: unitLabel(item.unitType),
      reason:
        'This item is switched on by an option the app does not ask the customer about, so it never bills. Point it at heater, salt system or screen enclosure, or clear the option and let its category price it',
    })
  }
  return out
}
