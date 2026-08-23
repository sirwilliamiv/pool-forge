import { PriceCategory } from '@prisma/client'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import { categoryLabel, type QuoteSummary } from '@/modules/pricing/engine'

// What the price covers, and what it does not.
//
// A proposal that lists priced rows and stops is a spreadsheet, not an offer.
// Every pool contract opens with a sentence describing the job and closes with
// a list of what is excluded, because the argument six weeks into a build is
// always about something nobody wrote down.
//
// Both lists below are derived from the same measurements and the same quote
// the money is computed from, so the narrative cannot describe a different pool
// than the table underneath it. Nothing here is boilerplate about a feature the
// customer is not buying: a job with no heater says so under "not included",
// and a job with a heater never mentions it there.

export interface ScopeSelections {
  heaterSelected: boolean
  saltSystemSelected: boolean
  screenSelected: boolean
  lightingQuantity: number
}

const fmt = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits })

/**
 * The opening sentence: what is being built, in the numbers the rest of the
 * document prints.
 */
export function scopeSummary(m: MeasurementSummary): string | null {
  if (!m.hasPool) return null
  const size = `${fmt(m.poolLengthFt, 1)} ft × ${fmt(m.poolWidthFt, 1)} ft`
  const depth = `${fmt(m.poolDepthShallow, 1)} ft to ${fmt(m.poolDepthDeep, 1)} ft`
  return (
    `Construction of a ${size} swimming pool, ${depth} deep, with ` +
    `${fmt(m.poolSurfaceArea)} sq ft of water surface and a capacity of about ` +
    `${fmt(m.poolGallons)} gallons.`
  )
}

/**
 * The included scope, as bullets.
 *
 * Driven off the priced categories rather than a checklist, so a line the price
 * book does not carry never appears here as something the builder promised.
 */
export function scopeOfWork(
  m: MeasurementSummary,
  quote: QuoteSummary,
  selections: ScopeSelections,
): string[] {
  const priced = new Set(quote.lineItems.map((line) => line.category))
  const out: string[] = []

  if (priced.has(PriceCategory.EARTHWORK)) {
    out.push(
      `Excavation and grading: ${fmt(m.cutYards, 1)} cu yd cut and ` +
        `${fmt(m.fillYards, 1)} cu yd fill, including haulage.`,
    )
  }
  if (priced.has(PriceCategory.POOL)) {
    out.push(
      `Pool shell: steel, plumbing and shell placement over ${fmt(m.poolWettedArea)} sq ft of ` +
        `wetted area, ${fmt(m.poolPerimeter, 1)} lf of perimeter.`,
    )
  }
  if (priced.has(PriceCategory.SPA)) {
    out.push(
      m.spaCount === 1
        ? 'Attached spa with spillover, plumbed and tied into the pool equipment set.'
        : `${m.spaCount} attached spas, plumbed and tied into the pool equipment set.`,
    )
  }
  if (priced.has(PriceCategory.BENCH)) {
    out.push(`Benches and sun shelves: ${fmt(m.benchLinearFeet, 1)} lf.`)
  }
  if (priced.has(PriceCategory.DECK)) {
    out.push(`Decking: ${fmt(m.deckArea)} sq ft, placed and finished.`)
  }
  if (priced.has(PriceCategory.COPING)) {
    out.push(`Coping: ${fmt(m.copingLinearFeet, 1)} lf around the pool bond beam.`)
  }
  if (priced.has(PriceCategory.DRAIN)) {
    out.push(`Deck drainage: ${fmt(m.decoDrainLinearFeet, 1)} lf of deco drain.`)
  }
  if (priced.has(PriceCategory.EQUIPMENT)) {
    const equipment = ['circulation pump']
    if (selections.heaterSelected) equipment.push('heater')
    if (selections.saltSystemSelected) equipment.push('salt chlorination')
    out.push(
      `Equipment set: ${equipment.join(', ')}, set on pad, plumbed and started up.`,
    )
  }
  if (priced.has(PriceCategory.LIGHTING) && selections.lightingQuantity > 0) {
    out.push(
      `Pool lighting: ${selections.lightingQuantity} fixture` +
        `${selections.lightingQuantity === 1 ? '' : 's'}, wired and tested.`,
    )
  }
  if (priced.has(PriceCategory.WATER_FEATURE)) {
    out.push(`Water features: ${fmt(m.waterFeatureCount)} placed and plumbed.`)
  }
  if (priced.has(PriceCategory.SCREEN)) {
    out.push(`Screen enclosure over ${fmt(m.deckArea)} sq ft of deck.`)
  }

  const covered = new Set<PriceCategory>([
    PriceCategory.EARTHWORK,
    PriceCategory.POOL,
    PriceCategory.SPA,
    PriceCategory.BENCH,
    PriceCategory.DECK,
    PriceCategory.COPING,
    PriceCategory.DRAIN,
    PriceCategory.EQUIPMENT,
    PriceCategory.LIGHTING,
    PriceCategory.WATER_FEATURE,
    PriceCategory.SCREEN,
  ])
  // Anything the price book carries that the bullets above do not name. Without
  // this, a category added to the book later would be billed and undescribed.
  for (const category of priced) {
    if (!covered.has(category)) out.push(`${categoryLabel(category)}, as itemised below.`)
  }

  return out
}

/**
 * Standing exclusions.
 *
 * Short on purpose. These are the four every pool job carries, and they are
 * scope rather than legal language: anything more belongs in the builder's own
 * agreement, which is what the editable terms paragraph is for.
 */
export const STANDING_EXCLUSIONS: string[] = [
  'Permit and impact fees payable to the authority having jurisdiction.',
  'Rock, hardpan, unsuitable soil or groundwater dewatering encountered during excavation.',
  'Safety barriers, fencing and gates required for final inspection.',
  'Landscaping, irrigation repair, sod and restoration of the access route.',
]

/**
 * What this particular job does not include.
 *
 * Job-specific entries come first and are derived: an option the builder did
 * not tick, and any scope the drawing contains that the quote could not price.
 * A customer reading "Screen enclosure: not included" has been told once, in
 * the place they will look for it afterwards.
 */
export function exclusions(quote: QuoteSummary, selections: ScopeSelections): string[] {
  const priced = new Set(quote.lineItems.map((line) => line.category))
  const out: string[] = []

  if (!selections.heaterSelected) out.push('Pool heating. No heater is included at this price.')
  if (!selections.saltSystemSelected) {
    out.push('Salt chlorination. Sanitisation is by the equipment set listed above.')
  }
  if (!selections.screenSelected) out.push('Screen enclosure or cage.')
  if (selections.lightingQuantity === 0) out.push('Pool and landscape lighting.')
  if (!priced.has(PriceCategory.DECK)) out.push('Decking beyond the pool bond beam.')

  for (const scope of quote.unpriced) {
    out.push(`${scope.label} (${fmt(scope.quantity, 2)} ${scope.unit}): ${scope.reason}.`)
  }

  return [...out, ...STANDING_EXCLUSIONS]
}
