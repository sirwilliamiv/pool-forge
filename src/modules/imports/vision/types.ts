// Shared vision-layer types.
//
// The extraction layer produces two things per image: a partial `DesignIntent`
// (the contract in `../intent.ts`, never modified here) and a raw geometry
// payload in image coordinates that the precision layer turns into inches once
// a scale is resolved. Vision never invents a number in inches: it reports
// normalized coordinates and the literal text it read.

import { z } from 'zod'
import type {
  DeckMaterial,
  EnclosureKind,
  Point,
  ShapeFamily,
} from '@/modules/imports/intent'

export const IMAGE_KINDS = [
  'SKETCH',
  'SITE_PLAN',
  'CONCEPT_RENDER',
  'SITE_PHOTO',
  'SCREENSHOT',
  'UNKNOWN',
] as const
export const ImageKindSchema = z.enum(IMAGE_KINDS)
export type ImageKind = z.infer<typeof ImageKindSchema>

/**
 * Things downstream stages need to know about an image before they trust it.
 * `no-scale-reference` in particular routes a SCREENSHOT away from the site
 * plan extractor and demotes it to intent only.
 */
export const QUALITY_FLAGS = [
  'blurry',
  'low-contrast',
  'cropped-edges',
  'heavy-perspective',
  'no-scale-reference',
  'glare',
  'handwriting-illegible',
  'multiple-drawings',
] as const
export const QualityFlagSchema = z.enum(QUALITY_FLAGS)
export type QualityFlag = z.infer<typeof QualityFlagSchema>

/** A point in normalized image space: 0..1 on both axes, origin top-left. */
export const NormalizedPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
})
export type NormalizedPoint = z.infer<typeof NormalizedPointSchema>

/** A point in source-image pixels, origin top-left. Derived, never asked for. */
export type PixelPoint = Point

export interface VisionImage {
  /** `SourceImage.id`, carried through so warnings can name their origin. */
  sourceImageId: string
  /** Base64 image bytes, already downscaled and EXIF-stripped by Track I1. */
  base64: string
  mimeType: string
  widthPx: number
  heightPx: number
}

/** Everything a caller needs to persist one `ImageAnalysis` row. */
export interface VisionUsage {
  model: string
  tokensIn: number
  tokensOut: number
  latencyMs: number
  /** Number of model round-trips, so a repair shows up as 2 rather than 1. */
  calls: number
}

export function emptyUsage(model: string): VisionUsage {
  return { model, tokensIn: 0, tokensOut: 0, latencyMs: 0, calls: 0 }
}

export function addUsage(a: VisionUsage, b: VisionUsage): VisionUsage {
  return {
    model: b.model || a.model,
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    latencyMs: a.latencyMs + b.latencyMs,
    calls: a.calls + b.calls,
  }
}

/**
 * One dimension annotation read off a drawing. `p1`/`p2` are pixel endpoints of
 * the dimension line, derived from the model's normalized coordinates and the
 * known image size. `parsedInches` is produced by the deterministic parser in
 * `dimensions.ts`, never by the model, and is null when the text did not parse.
 */
export interface DimensionAnnotation {
  p1: PixelPoint
  p2: PixelPoint
  textValue: string
  parsedInches: number | null
  /** What the annotation measures, when the model could tell. */
  appliesTo:
    | 'pool-length'
    | 'pool-width'
    | 'pool-depth'
    | 'deck-width'
    | 'setback'
    | 'feature'
    | 'other'
    | null
}

/** A handwritten or printed scale legend, for example "1 square = 1 ft". */
export interface ScaleLegend {
  text: string
  /** Real-world units represented by one grid square, when stated. */
  unitsPerSquare: number | null
  unit: 'ft' | 'in' | 'm' | 'cm' | null
}

/** Geometry payload from a SKETCH. Image coordinates only, no inches. */
export interface SketchGeometry {
  source: 'sketch'
  /** Coarse closed pool outline, 8..40 points, normalized 0..1. */
  poolPolygonNormalized: NormalizedPoint[]
  dimensions: DimensionAnnotation[]
  scaleLegend: ScaleLegend | null
  gridVisible: boolean
}

/** Geometry payload from a SITE_PLAN or a scaled SCREENSHOT. */
export interface SitePlanGeometry {
  source: 'sitePlan'
  propertyBoundaryNormalized: NormalizedPoint[] | null
  houseFootprintNormalized: NormalizedPoint[] | null
  poolPolygonNormalized: NormalizedPoint[] | null
  dimensions: DimensionAnnotation[]
  scaleBar: {
    p1: PixelPoint
    p2: PixelPoint
    labelText: string
    parsedInches: number | null
  } | null
  northArrow: { from: PixelPoint; to: PixelPoint; degrees: number } | null
}

export type ExtractionGeometry = SketchGeometry | SitePlanGeometry

/**
 * A partial `DesignIntent`. Every branch is optional at the top level and every
 * leaf keeps the contract's `| null`, so an extractor states "I did not look at
 * this" (key absent) separately from "I looked and there is nothing" (null).
 */
export interface PartialDesignIntent {
  pool?: {
    shapeFamily?: ShapeFamily
    lengthFt?: number | null
    widthFt?: number | null
    depthShallowFt?: number | null
    depthDeepFt?: number | null
  }
  features?: {
    stencilId: string | null
    label: string
    lengthFt: number | null
    widthFt: number | null
    count: number
  }[]
  deck?: {
    material?: DeckMaterial
    widthFt?: number | null
  }
  enclosure?: {
    present?: boolean
    kind?: EnclosureKind
    heightFt?: number | null
  }
  site?: {
    setbacksFt?: {
      front: number | null
      rear: number | null
      left: number | null
      right: number | null
    } | null
    northDeg?: number | null
    notes?: string[]
  }
  materials?: {
    interiorFinish?: string | null
    copingMaterial?: string | null
    tileBand?: string | null
    deckMaterial?: string | null
  }
}

/**
 * One image's contribution to the merged intent. `geometry` stays out of the
 * intent proper because it is in image coordinates: the precision layer owns
 * the conversion to inches and the resolution of `scale`.
 */
export interface IntentContribution {
  sourceImageId: string
  kind: ImageKind
  extractorVersion: string
  intent: PartialDesignIntent
  /** Dotted paths into `DesignIntent`, 0..1. */
  fieldConfidence: Record<string, number>
  warnings: string[]
  geometry: ExtractionGeometry | null
  usage: VisionUsage
}

export interface ClassificationResult {
  kind: ImageKind
  /** Clockwise rotation in degrees needed to bring the image upright. */
  rotationDeg: number
  qualityFlags: QualityFlag[]
  confidence: number
}

/** Plain object shape of an `ImageAnalysis` row, built without touching Prisma. */
export interface AnalysisRecord {
  sourceImageId: string
  stage: 'CLASSIFY' | 'EXTRACT'
  extractorVersion: string
  model: string
  promptHash: string
  rawJson: string
  parsedJson: string | null
  tokensIn: number
  tokensOut: number
  latencyMs: number
  status: 'OK' | 'REPAIRED' | 'FAILED'
  errorRef: string | null
}

/** Convert normalized 0..1 coordinates to source-image pixels. */
export function toPixels(point: NormalizedPoint, widthPx: number, heightPx: number): PixelPoint {
  return { x: point.x * widthPx, y: point.y * heightPx }
}
