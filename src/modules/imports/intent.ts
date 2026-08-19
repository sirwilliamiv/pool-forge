// DesignIntent v1 — the contract every image-ingestion track reads and writes.
//
// Five kind-specific extractors collapse into this one shape; the review wizard
// and the apply command batch read only this. It is the seam that lets the
// ingestion tracks be built in parallel.
//
// Deliberately flat: no recursion, no top-level discriminated unions, and
// confidence lives in one flat dotted-path map rather than beside every node.
// Gemini's JSON-Schema subset cannot express recursive or polymorphic shapes
// and silently emits `{}` for the affected fields, so extractors validate with
// Zod plus a one-shot repair round-trip rather than passing `responseSchema`.
//
// Every optional value is `.nullable()`, never `.optional()`. Under
// `exactOptionalPropertyTypes` an absent key and an explicit `undefined` are
// different types, and a model response round-tripped through JSON cannot
// express the difference. Null is the only honest wire representation.

import { z } from 'zod'

export const DESIGN_INTENT_VERSION = 1 as const

/** Distance unit for every `*Ft` field is feet. Points are in inches. */
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Point = z.infer<typeof PointSchema>

/**
 * A closed footprint in intent-frame inches, origin at the top-left of the
 * source image's calibrated frame. Always treated as closed; the last point is
 * never a repeat of the first.
 */
export const FootprintSchema = z.object({
  points: z.array(PointSchema).min(3),
})
export type Footprint = z.infer<typeof FootprintSchema>

export const SHAPE_FAMILIES = [
  'rectangle',
  'oval',
  'kidney',
  'grecian',
  'roman',
  'lagoon',
  'lshape',
  'freeform',
  'unknown',
] as const
export const ShapeFamilySchema = z.enum(SHAPE_FAMILIES)
export type ShapeFamily = z.infer<typeof ShapeFamilySchema>

export const DECK_MATERIALS = ['concrete', 'paver', 'travertine', 'grass', 'unknown'] as const
export const DeckMaterialSchema = z.enum(DECK_MATERIALS)
export type DeckMaterial = z.infer<typeof DeckMaterialSchema>

export const ENCLOSURE_KINDS = ['screen', 'lanai', 'none'] as const
export const EnclosureKindSchema = z.enum(ENCLOSURE_KINDS)
export type EnclosureKind = z.infer<typeof EnclosureKindSchema>

/**
 * How `pixelsPerInch` was resolved. Ordered by trustworthiness: a detected
 * grid pitch is deterministic, a labeled dimension depends on the model having
 * read the text correctly, and `manual` is the human fallback.
 */
export const SCALE_METHODS = ['grid', 'labeled-dimension', 'scale-bar', 'manual'] as const
export const ScaleMethodSchema = z.enum(SCALE_METHODS)
export type ScaleMethod = z.infer<typeof ScaleMethodSchema>

export const ScaleSchema = z.object({
  /**
   * Null means scale is unresolved. `import.intent.apply` refuses to apply any
   * footprint or derived dimension while this is null: the user gets the
   * calibration tool rather than a confidently wrong pool.
   */
  pixelsPerInch: z.number().positive().nullable(),
  method: ScaleMethodSchema.nullable(),
  confidence: z.number().min(0).max(1),
})
export type Scale = z.infer<typeof ScaleSchema>

export const PoolIntentSchema = z.object({
  footprint: FootprintSchema.nullable(),
  shapeFamily: ShapeFamilySchema,
  lengthFt: z.number().positive().nullable(),
  widthFt: z.number().positive().nullable(),
  depthShallowFt: z.number().positive().nullable(),
  depthDeepFt: z.number().positive().nullable(),
})
export type PoolIntent = z.infer<typeof PoolIntentSchema>

export const FeatureIntentSchema = z.object({
  /** Resolves against the `StencilDef` catalog. Null when unmatched. */
  stencilId: z.string().nullable(),
  /** Always populated, even when `stencilId` is null, so the UI can show it. */
  label: z.string(),
  lengthFt: z.number().positive().nullable(),
  widthFt: z.number().positive().nullable(),
  count: z.number().int().positive(),
  /** Intent-frame inches. Null when position could not be located. */
  x: z.number().nullable(),
  y: z.number().nullable(),
})
export type FeatureIntent = z.infer<typeof FeatureIntentSchema>

export const DeckIntentSchema = z.object({
  footprint: FootprintSchema.nullable(),
  material: DeckMaterialSchema,
  widthFt: z.number().positive().nullable(),
})
export type DeckIntent = z.infer<typeof DeckIntentSchema>

export const EnclosureIntentSchema = z.object({
  present: z.boolean(),
  kind: EnclosureKindSchema,
  heightFt: z.number().positive().nullable(),
  footprint: FootprintSchema.nullable(),
})
export type EnclosureIntent = z.infer<typeof EnclosureIntentSchema>

export const SiteIntentSchema = z.object({
  propertyBoundary: FootprintSchema.nullable(),
  houseFootprint: FootprintSchema.nullable(),
  /** Front / rear / left / right setbacks in feet, as read from a plat. */
  setbacksFt: z
    .object({
      front: z.number().nullable(),
      rear: z.number().nullable(),
      left: z.number().nullable(),
      right: z.number().nullable(),
    })
    .nullable(),
  /** Degrees clockwise from the image's +Y axis to true north. */
  northDeg: z.number().nullable(),
  notes: z.array(z.string()),
})
export type SiteIntent = z.infer<typeof SiteIntentSchema>

export const MaterialsIntentSchema = z.object({
  interiorFinish: z.string().nullable(),
  copingMaterial: z.string().nullable(),
  tileBand: z.string().nullable(),
  deckMaterial: z.string().nullable(),
})
export type MaterialsIntent = z.infer<typeof MaterialsIntentSchema>

export const DesignIntentSchema = z.object({
  version: z.literal(DESIGN_INTENT_VERSION),
  sourceImageIds: z.array(z.string()),
  pool: PoolIntentSchema,
  features: z.array(FeatureIntentSchema),
  deck: DeckIntentSchema,
  enclosure: EnclosureIntentSchema,
  site: SiteIntentSchema,
  materials: MaterialsIntentSchema,
  scale: ScaleSchema,
  /**
   * Dotted path (`pool.lengthFt`, `features.0.count`) to a 0..1 score. Flat by
   * design: nesting confidence beside every node is what forces a schema into
   * the polymorphic shapes Gemini cannot express.
   */
  fieldConfidence: z.record(z.string(), z.number().min(0).max(1)),
  warnings: z.array(z.string()),
})
export type DesignIntent = z.infer<typeof DesignIntentSchema>

/** Confidence bands. Below `REVIEW_REQUIRED` a field cannot apply untouched. */
export const CONFIDENCE_HIGH = 0.85
export const CONFIDENCE_REVIEW_REQUIRED = 0.6

export type ConfidenceBand = 'high' | 'medium' | 'low'

export function confidenceBand(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_HIGH) return 'high'
  if (score >= CONFIDENCE_REVIEW_REQUIRED) return 'medium'
  return 'low'
}

/**
 * Dotted paths whose confidence is below the review threshold. `apply` refuses
 * to write these until a human has touched them via `import.intent.patch`.
 */
export function fieldsRequiringReview(intent: DesignIntent): string[] {
  return Object.entries(intent.fieldConfidence)
    .filter(([, score]) => score < CONFIDENCE_REVIEW_REQUIRED)
    .map(([path]) => path)
    .sort()
}

/**
 * True when correcting `touchedPath` also accounts for `candidate`.
 *
 * Matching is segment-wise, and a touched ancestor covers its descendants:
 * editing the whole `features` array is a review of `features.0.count`, and
 * editing `site.setbacksFt` is a review of `site.setbacksFt.front`. Without
 * this, any confidence key deeper than the patch granularity could never be
 * cleared and would block apply forever.
 *
 * Segment-wise matters: `pool.length` must not cover `pool.lengthFt`.
 */
export function pathCoveredBy(touchedPath: string, candidate: string): boolean {
  if (touchedPath === candidate) return true
  return candidate.startsWith(`${touchedPath}.`)
}

/**
 * Gate 2 from the design spec. Returns the dotted paths still below the review
 * threshold that no human correction has covered, which are exactly what
 * blocks `import.intent.apply`.
 *
 * Lives here rather than beside the command so the review UI and the server
 * enforce one implementation. The command module calls `register()` at load and
 * lazily imports Prisma, so a client bundle cannot import from it.
 */
export function unreviewedFieldPaths(intent: DesignIntent, touched: string[]): string[] {
  return fieldsRequiringReview(intent).filter(
    candidate => !touched.some(t => pathCoveredBy(t, candidate)),
  )
}

/** True when geometry may be applied. Scale gates every derived dimension. */
export function hasResolvedScale(intent: DesignIntent): boolean {
  return intent.scale.pixelsPerInch !== null && intent.scale.pixelsPerInch > 0
}

/** An empty intent, used as the merge seed and by the review UI before extraction. */
export function emptyDesignIntent(sourceImageIds: string[] = []): DesignIntent {
  return {
    version: DESIGN_INTENT_VERSION,
    sourceImageIds,
    pool: {
      footprint: null,
      shapeFamily: 'unknown',
      lengthFt: null,
      widthFt: null,
      depthShallowFt: null,
      depthDeepFt: null,
    },
    features: [],
    deck: { footprint: null, material: 'unknown', widthFt: null },
    enclosure: { present: false, kind: 'none', heightFt: null, footprint: null },
    site: {
      propertyBoundary: null,
      houseFootprint: null,
      setbacksFt: null,
      northDeg: null,
      notes: [],
    },
    materials: {
      interiorFinish: null,
      copingMaterial: null,
      tileBand: null,
      deckMaterial: null,
    },
    scale: { pixelsPerInch: null, method: null, confidence: 0 },
    fieldConfidence: {},
    warnings: [],
  }
}
