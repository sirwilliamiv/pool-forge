// What pressing Apply will create, stated before anything is created.
//
// Pure and total: it reads a `DesignIntent` and produces the same sentence the
// footer shows. Nobody should press Apply and be surprised, so this is written
// as data rather than as JSX and is unit tested against the intent shapes the
// extractors actually emit.

import { hasResolvedScale, type DesignIntent } from '@/modules/imports/intent'

export type ApplyDiffKind = 'pool' | 'deck' | 'enclosure' | 'feature' | 'site'

export interface ApplyDiffItem {
  key: string
  kind: ApplyDiffKind
  count: number
  /** Singular noun. `describeApplyDiff` handles the plural. */
  noun: string
  /** Dimensions or material, or null when nothing further is known. */
  detail: string | null
  /** Geometry that a null scale blocks from being written. */
  needsScale: boolean
}

function plural(noun: string, count: number): string {
  if (count === 1) return noun
  if (/(?:shel|lea|hal|cal|sel)f$/i.test(noun)) return `${noun.slice(0, -1)}ves`
  if (/(?:s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`
  return `${noun}s`
}

/** Trims a trailing `.0` so 32 reads as "32" and 32.5 reads as "32.5". */
export function formatFeet(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function dimensions(lengthFt: number | null, widthFt: number | null): string | null {
  if (lengthFt === null && widthFt === null) return null
  if (lengthFt !== null && widthFt !== null) {
    return `${formatFeet(lengthFt)} ft x ${formatFeet(widthFt)} ft`
  }
  const only = lengthFt ?? widthFt
  return only === null ? null : `${formatFeet(only)} ft`
}

export function summarizeApplyDiff(intent: DesignIntent): ApplyDiffItem[] {
  const items: ApplyDiffItem[] = []

  const poolDims = dimensions(intent.pool.lengthFt, intent.pool.widthFt)
  const hasPool = intent.pool.footprint !== null || poolDims !== null
  if (hasPool) {
    const noun = intent.pool.footprint !== null ? 'polygon pool' : 'rectangle pool'
    const family =
      intent.pool.shapeFamily === 'unknown' || intent.pool.footprint === null
        ? null
        : intent.pool.shapeFamily
    const detail = [family, poolDims].filter((p): p is string => p !== null).join(', ')
    items.push({
      key: 'pool',
      kind: 'pool',
      count: 1,
      noun,
      detail: detail === '' ? null : detail,
      needsScale: true,
    })
  }

  const hasDeck = intent.deck.footprint !== null || intent.deck.widthFt !== null
  if (hasDeck) {
    const material = intent.deck.material === 'unknown' ? null : intent.deck.material
    items.push({
      key: 'deck',
      kind: 'deck',
      count: 1,
      noun: material === null ? 'deck' : `${material} deck`,
      detail: intent.deck.widthFt === null ? null : `${formatFeet(intent.deck.widthFt)} ft wide`,
      needsScale: true,
    })
  }

  if (intent.enclosure.present && intent.enclosure.kind !== 'none') {
    items.push({
      key: 'enclosure',
      kind: 'enclosure',
      count: 1,
      noun: `${intent.enclosure.kind} enclosure`,
      detail:
        intent.enclosure.heightFt === null
          ? null
          : `${formatFeet(intent.enclosure.heightFt)} ft tall`,
      needsScale: true,
    })
  }

  // Features collapse by label so "2 sun shelves" reads as one line rather
  // than as two identical ones.
  const byLabel = new Map<string, { count: number; detail: string | null }>()
  for (const feature of intent.features) {
    const label = feature.label.trim() === '' ? 'feature' : feature.label.trim()
    const existing = byLabel.get(label)
    const detail = dimensions(feature.lengthFt, feature.widthFt)
    if (existing) {
      existing.count += feature.count
      if (existing.detail === null) existing.detail = detail
    } else {
      byLabel.set(label, { count: feature.count, detail })
    }
  }
  for (const [label, entry] of byLabel) {
    items.push({
      key: `feature:${label}`,
      kind: 'feature',
      count: entry.count,
      noun: label.toLowerCase(),
      detail: entry.detail,
      needsScale: false,
    })
  }

  if (intent.site.propertyBoundary !== null) {
    items.push({
      key: 'site.propertyBoundary',
      kind: 'site',
      count: 1,
      noun: 'property boundary',
      detail: null,
      needsScale: true,
    })
  }
  if (intent.site.houseFootprint !== null) {
    items.push({
      key: 'site.houseFootprint',
      kind: 'site',
      count: 1,
      noun: 'house footprint',
      detail: null,
      needsScale: true,
    })
  }

  return items
}

/** "1 polygon pool 32 ft x 16 ft" for one item. */
export function describeApplyDiffItem(item: ApplyDiffItem): string {
  const head = `${item.count} ${plural(item.noun, item.count)}`
  return item.detail === null ? head : `${head} ${item.detail}`
}

/** The one-line footer sentence: every item, comma separated. */
export function describeApplyDiff(items: ApplyDiffItem[]): string {
  if (items.length === 0) return 'Nothing to create yet'
  return items.map(describeApplyDiffItem).join(', ')
}

/**
 * Items a null `scale.pixelsPerInch` blocks. Gate 1: without a scale there is
 * no honest way to place geometry, so the user gets the calibration tool
 * rather than a confidently wrong pool.
 */
export function itemsBlockedByScale(intent: DesignIntent, items: ApplyDiffItem[]): ApplyDiffItem[] {
  if (hasResolvedScale(intent)) return []
  return items.filter((item) => item.needsScale)
}

export function hasApplicableContent(intent: DesignIntent): boolean {
  return summarizeApplyDiff(intent).length > 0
}
