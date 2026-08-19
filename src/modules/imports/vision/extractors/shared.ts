// Pieces every extractor shares: response fragments, coordinate conversion,
// and the deterministic text-to-number step.

import { z } from 'zod'
import { parseDimension, type LinearUnit } from '../dimensions'
import { NormalizedPointSchema, toPixels, type DimensionAnnotation, type NormalizedPoint, type VisionImage } from '../types'

export const APPLIES_TO = [
  'pool-length',
  'pool-width',
  'pool-depth',
  'deck-width',
  'setback',
  'feature',
  'other',
] as const
export const AppliesToSchema = z.enum(APPLIES_TO)
export type AppliesTo = z.infer<typeof AppliesToSchema>

export const DimensionEntrySchema = z.object({
  p1: NormalizedPointSchema,
  p2: NormalizedPointSchema,
  text: z.string().min(1),
  appliesTo: AppliesToSchema.nullable(),
})
export type DimensionEntry = z.infer<typeof DimensionEntrySchema>

export const ConfidenceScoreSchema = z.number().min(0).max(1)

/** Polygon as the model may send it: coarse but at least a closed shape. */
export const ModelPolygonSchema = z.array(NormalizedPointSchema).max(40)

const MIN_CONTRACT_POINTS = 8

/**
 * The contract asks for 8 to 40 points. Models routinely answer a rectangle
 * with 4 corners, which is a correct outline and a schema violation, and
 * spending the single repair round-trip on it would be a waste. Subdivide
 * deterministically instead and say so in a warning.
 */
export function densifyPolygon(points: NormalizedPoint[]): { points: NormalizedPoint[]; densified: boolean } {
  if (points.length === 0 || points.length >= MIN_CONTRACT_POINTS) return { points, densified: false }
  let current = points
  while (current.length < MIN_CONTRACT_POINTS) {
    const next: NormalizedPoint[] = []
    for (let i = 0; i < current.length; i += 1) {
      const a = current[i]
      const b = current[(i + 1) % current.length]
      if (a === undefined || b === undefined) continue
      next.push(a)
      next.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    }
    if (next.length <= current.length) break
    current = next.slice(0, 40)
  }
  return { points: current, densified: true }
}

export interface AnnotationBuild {
  annotations: DimensionAnnotation[]
  warnings: string[]
  /** True when at least one value only parsed by assuming the default unit. */
  assumedUnits: boolean
  unparsedCount: number
}

/**
 * Convert model dimension entries into pixel-space annotations with a parsed
 * value. The model never supplies the number: `parsedInches` comes from the
 * deterministic parser, and stays null when the text does not parse.
 */
export function buildAnnotations(
  entries: DimensionEntry[],
  image: VisionImage,
  defaultUnit: LinearUnit | null,
): AnnotationBuild {
  const annotations: DimensionAnnotation[] = []
  const warnings: string[] = []
  let assumedUnits = false
  let unparsedCount = 0

  for (const entry of entries) {
    const options = defaultUnit === null ? {} : { defaultUnit }
    const parsed = parseDimension(entry.text, options)
    if (parsed.inches === null) {
      unparsedCount += 1
      warnings.push(
        `Could not read the dimension "${entry.text}" on image ${image.sourceImageId}: ${parsed.reason ?? 'unparseable'}. It was left out of the measurements.`,
      )
    }
    if (parsed.assumedUnit) {
      assumedUnits = true
      warnings.push(
        `The dimension "${entry.text}" on image ${image.sourceImageId} has no unit written; it was read as ${defaultUnit}.`,
      )
    }
    annotations.push({
      p1: toPixels(entry.p1, image.widthPx, image.heightPx),
      p2: toPixels(entry.p2, image.widthPx, image.heightPx),
      textValue: entry.text,
      parsedInches: parsed.inches,
      appliesTo: entry.appliesTo,
    })
  }

  return { annotations, warnings, assumedUnits, unparsedCount }
}

/** First parsed value among annotations tagged with the given role, in feet. */
export function feetFor(annotations: DimensionAnnotation[], role: AppliesTo): number | null {
  for (const annotation of annotations) {
    if (annotation.appliesTo === role && annotation.parsedInches !== null && annotation.parsedInches > 0) {
      return annotation.parsedInches / 12
    }
  }
  return null
}

/** Parse a free text depth such as `3'-6"` into feet. */
export function depthFeet(text: string | null, defaultUnit: LinearUnit | null): number | null {
  if (text === null) return null
  const options = defaultUnit === null ? {} : { defaultUnit }
  const parsed = parseDimension(text, options)
  if (parsed.inches === null || parsed.inches <= 0) return null
  return parsed.inches / 12
}

export function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/** Reduce a confidence when the read depended on an assumption. */
export function penalize(value: number, penalty: number): number {
  return clampConfidence(value - penalty)
}

/** Collapse repeated feature labels, keeping the larger count. */
export interface RawFeature {
  label: string
  count: number
  lengthFt: number | null
  widthFt: number | null
}

export function dedupeFeatures(features: RawFeature[]): RawFeature[] {
  const byKey = new Map<string, RawFeature>()
  for (const feature of features) {
    const key = feature.label.trim().toLowerCase()
    if (key === '') continue
    const existing = byKey.get(key)
    if (existing === undefined) {
      byKey.set(key, { ...feature, label: feature.label.trim() })
      continue
    }
    byKey.set(key, {
      label: existing.label,
      count: Math.max(existing.count, feature.count),
      lengthFt: existing.lengthFt ?? feature.lengthFt,
      widthFt: existing.widthFt ?? feature.widthFt,
    })
  }
  return [...byKey.values()]
}
