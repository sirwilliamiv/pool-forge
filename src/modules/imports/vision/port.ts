// Adapter binding Track I2's extractors to Track I1's `VisionAnalysisPort`.
//
// The two tracks were built in parallel over disjoint files, so neither could
// import the other. This is the seam that joins them, and it is the only file
// that knows about both. Without it registered, `getVisionAnalysisPort()`
// returns the no-op and every image analyses to a PENDING row that never
// resolves, which is exactly what a live smoke test showed.
//
// Nothing here calls a model directly: classification, extraction, repair, and
// merge all live in this module already. This translates shapes and reads the
// blob, nothing more.

import {
  getVisionAnalysisPort,
  setVisionAnalysisPort,
  type SourceImageKind,
  type VisionAnalysisPort,
  type VisionAnalysisRequest,
  type VisionAnalysisResult,
  type VisionStageResult,
  NOOP_EXTRACTOR_VERSION,
} from '@/modules/imports/analysis-port'
import { getBlobStore } from '@/modules/storage'
import type { DesignIntent } from '@/modules/imports/intent'

import { detectGrid } from '@/modules/imports/precision/grid'
import { snapPolygonToInk } from '@/modules/imports/precision/ink'
import { preferredScale } from '@/modules/imports/precision/scale'
import type { LabeledDimension } from '@/modules/imports/precision/scale'
import {
  runPrecisionPipeline,
  type PrecisionInput,
  type ScaleBarReading,
} from '@/modules/imports/precision/pipeline'

import { createVisionClient } from './client'
import { classifyImage } from './classify'
import { extractForKind } from './extractors'
import { mergeContributions } from './merge'
import type {
  AnalysisRecord,
  ExtractionGeometry,
  ScaleLegend,
  VisionImage,
} from './types'

/**
 * Bumped whenever a prompt or a parser changes, because it keys the
 * `ImageAnalysis` cache: an image already analysed at this version is not
 * re-sent to the model.
 */
export const VISION_PORT_VERSION = 'vertex-v1'

const CLASSIFY_MODEL_ENV = 'VERTEX_CLASSIFY_MODEL'
const EXTRACT_MODEL_ENV = 'VERTEX_EXTRACT_MODEL'

function modelFrom(envKey: string, fallback: string): string {
  const value = process.env[envKey]?.trim()
  return value && value.length > 0 ? value : fallback
}

/**
 * `AnalysisRecord` carries a REPAIRED status that the persistence layer does
 * not model, since a repaired call still produced a usable payload. It maps to
 * OK; the fact that a repair happened is preserved in the raw JSON.
 */
/** Best-effort parse; a payload that is not JSON is kept verbatim. */
function safeJson(value: string | null): unknown {
  if (value === null) return {}
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toStageResult(record: AnalysisRecord): VisionStageResult {
  return {
    stage: record.stage,
    status: record.status === 'FAILED' ? 'FAILED' : 'OK',
    model: record.model,
    promptHash: record.promptHash,
    raw: safeJson(record.rawJson),
    // Parsed back into an object: the record carries it as a JSON string, and
    // storing that string in a Json column made every ImageAnalysis row a
    // quoted blob that has to be re-parsed before it can be read or queried.
    parsed: safeJson(record.parsedJson),
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    latencyMs: record.latencyMs,
    errorRef: record.errorRef,
  }
}


const INCHES_PER = { ft: 12, in: 1, m: 39.3701, cm: 0.393701 } as const

/**
 * What one grid square is worth, in inches, from a legend like "1 sq = 1 ft".
 * Null when the legend was absent or stated a unit we do not convert.
 */
function squareInchesFromLegend(legend: ScaleLegend | null): number | null {
  if (legend === null || legend.unitsPerSquare === null || legend.unit === null) return null
  const factor = INCHES_PER[legend.unit]
  if (factor === undefined) return null
  const inches = legend.unitsPerSquare * factor
  return inches > 0 ? inches : null
}

/**
 * Decode the vision copy to a single-channel intensity buffer for grid
 * detection. The detector wants raw luminance, not a JPEG.
 */
async function greyscaleField(
  bytes: Buffer,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    const sharp = (await import('sharp')).default
    const { data, info } = await sharp(bytes)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
  } catch {
    // A decode failure must not fail the whole analysis: without a grid the
    // scale simply falls through to the labeled dimensions.
    return null
  }
}

/**
 * CALIBRATE and TRANSLATE. The model deliberately leaves `scale.pixelsPerInch`
 * null and reports geometry in image space; resolving it is the precision
 * layer's job, and every number produced here is deterministic.
 */
async function applyPrecision(
  intent: DesignIntent,
  geometry: ExtractionGeometry | undefined,
  bytes: Buffer,
  sourceImageId: string,
): Promise<DesignIntent> {
  if (!geometry) return intent

  const polygonNormalized = geometry.poolPolygonNormalized
  if (!polygonNormalized || polygonNormalized.length < 3) return intent

  // Recorded first, before any step that can bail. Scale resolution needs the
  // raster decoded and grid detection can legitimately find nothing, but the
  // outline itself needs neither: it is normalized image coordinates. Setting
  // it only on the success path is what left the review overlay blank.
  const withImageSpace: DesignIntent = {
    ...intent,
    imageSpace: {
      sourceImageId,
      poolPolygon: polygonNormalized.map(pt => ({ x: pt.x, y: pt.y })),
      gridVisible: geometry.source === 'sketch' ? geometry.gridVisible : false,
    },
  }

  const field = await greyscaleField(bytes)
  const width = field?.width ?? 0
  const height = field?.height ?? 0
  if (width === 0 || height === 0) return withImageSpace

  const modelPolygonPx = polygonNormalized.map(pt => ({ x: pt.x * width, y: pt.y * height }))

  // The model's proportions are trustworthy and its placement is not, so the
  // outline is moved onto the filled region it was describing before anything
  // measures it. Without this the polygon lands near the drawing rather than on
  // it, and every derived number inherits the offset.
  const snapped = field ? snapPolygonToInk(modelPolygonPx, field.data, width, height) : null
  const polygonPx = snapped?.region ? snapped.points : modelPolygonPx

  const labeledDimensions: LabeledDimension[] = geometry.dimensions
    .filter(d => d.parsedInches !== null && d.parsedInches > 0)
    .map(d => ({ p1: d.p1, p2: d.p2, realInches: d.parsedInches as number }))

  let scaleBar: ScaleBarReading | null = null
  if (geometry.source === 'sitePlan' && geometry.scaleBar?.parsedInches) {
    scaleBar = {
      p1: geometry.scaleBar.p1,
      p2: geometry.scaleBar.p2,
      realInches: geometry.scaleBar.parsedInches,
    }
  }

  const grid =
    field && geometry.source === 'sketch' && geometry.gridVisible
      ? detectGrid(field.data, field.width, field.height)
      : null

  const input: PrecisionInput = {
    polygonPx,
    grid,
    gridSquareRealInches:
      geometry.source === 'sketch' ? squareInchesFromLegend(geometry.scaleLegend) : null,
    labeledDimensions,
    scaleBar,
    manual: null,
    options: {},
  }

  const precision = runPrecisionPipeline(input)

  const snapWarnings = snapped?.region
    ? []
    : ['the outline could not be matched to a filled shape on the page, so its position is the model estimate']

  const next: DesignIntent = {
    ...withImageSpace,
    scale: preferredScale(intent.scale, precision.scale),
    // The overlay shows the snapped outline, so what the user checks is the
    // same geometry the measurements came from.
    imageSpace: {
      ...withImageSpace.imageSpace!,
      poolPolygon: polygonPx.map(p => ({ x: p.x / width, y: p.y / height })),
    },
    warnings: [...intent.warnings, ...precision.warnings, ...snapWarnings],
  }
  if (precision.polygonInches && precision.polygonInches.length >= 3) {
    next.pool = { ...next.pool, footprint: { points: precision.polygonInches } }
  }
  return next
}

/**
 * The one sentence the builder gets when classification declined to route the
 * image. Kept next to the early return it explains.
 */
export const UNROUTABLE_WARNING =
  'This image was not recognised as a sketch, site plan, concept render, site photo, or screenshot, so extraction and calibration never ran and no field was read from it.'

/** Appends a warning without duplicating it when the image is re-analysed. */
function withWarning(intent: DesignIntent, warning: string): DesignIntent {
  if (intent.warnings.includes(warning)) return intent
  return { ...intent, warnings: [...intent.warnings, warning] }
}

export const vertexVisionAnalysisPort: VisionAnalysisPort = {
  extractorVersion: VISION_PORT_VERSION,

  async analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult> {
    const store = getBlobStore()
    const bytes = await store.get(request.visionKey)

    const image: VisionImage = {
      sourceImageId: request.sourceImageId,
      base64: bytes.toString('base64'),
      mimeType: request.visionMimeType,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
    }

    const client = createVisionClient()
    const stages: VisionStageResult[] = []

    const classification = await classifyImage({
      client,
      image,
      model: modelFrom(CLASSIFY_MODEL_ENV, 'gemini-2.5-flash'),
    })
    stages.push(toStageResult(classification.analysis))

    // An image nobody could classify is surfaced to the builder rather than run
    // through an extractor chosen at random.
    //
    // Returning here used to be silent: one CLASSIFY row, no extraction, no
    // warning, and a review screen that read "1 of 3 stages" with every field
    // empty and nothing anywhere saying why. The stop is a result, so it is
    // reported like one.
    if (classification.kind === 'UNKNOWN') {
      return {
        extractorVersion: VISION_PORT_VERSION,
        kind: 'UNKNOWN',
        intent: withWarning(request.intent, UNROUTABLE_WARNING),
        stages,
      }
    }

    const extraction = await extractForKind({
      client,
      image,
      model: modelFrom(EXTRACT_MODEL_ENV, 'gemini-2.5-pro'),
      classification,
    })
    stages.push(toStageResult(extraction.analysis))

    const merged = mergeContributions([extraction.contribution])
    const intent = await applyPrecision(
      merged.intent,
      merged.geometryBySource[request.sourceImageId],
      bytes,
      request.sourceImageId,
    )

    // The review screen's ledger tracks CLASSIFY, EXTRACT and CALIBRATE. Without
    // this row calibration read "NOT RUN" and the header stuck at "2 of 3
    // stages" forever, whatever the pipeline actually did.
    //
    // Status describes whether the stage ran, not whether it found a scale. An
    // image with no grid, no dimension and no scale bar is a completed
    // calibration with a null result, and the banner is what says so; marking
    // it FAILED would invite a re-run that cannot possibly help.
    // Only recorded when a scale actually came out of it. Reporting the stage
    // Done because it merely ran put a green check directly above a red banner
    // saying the image has no scale, which is incoherent. Calibration is not
    // complete until a scale exists, and leaving it open is what points the
    // user at the Calibrate button.
    if (intent.scale.pixelsPerInch !== null) {
      stages.push({
        stage: 'CALIBRATE',
        status: 'OK',
        model: intent.scale.method === 'manual' ? 'manual' : 'deterministic',
        promptHash: 'n/a',
        raw: {},
        parsed: {
          pixelsPerInch: intent.scale.pixelsPerInch,
          method: intent.scale.method,
          confidence: intent.scale.confidence,
        },
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        errorRef: null,
      })
    }

    // The final intent is persisted as the TRANSLATE stage so a cache hit can
    // replay it into another session. Without this row the cache knows an image
    // was analysed but not what the analysis concluded.
    stages.push({
      stage: 'TRANSLATE',
      status: 'OK',
      model: extraction.analysis.model,
      promptHash: extraction.analysis.promptHash,
      raw: {},
      parsed: intent,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      errorRef: null,
    })

    return {
      extractorVersion: VISION_PORT_VERSION,
      kind: classification.kind as SourceImageKind,
      intent,
      stages,
    }
  },
}

/**
 * Idempotent, so calling this from more than one entry point is safe.
 *
 * Registration is explicit rather than a module side effect: a bare import
 * silently rebinding a global is the kind of thing that makes a test suite
 * order-dependent. It also only ever replaces the no-op, so a test that has
 * installed a fake port keeps it.
 */
export function installVertexVisionPort(): void {
  if (getVisionAnalysisPort().extractorVersion !== NOOP_EXTRACTOR_VERSION) return
  setVisionAnalysisPort(vertexVisionAnalysisPort)
}
