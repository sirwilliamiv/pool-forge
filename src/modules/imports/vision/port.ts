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

import { createVisionClient } from './client'
import { classifyImage } from './classify'
import { extractForKind } from './extractors'
import { mergeContributions } from './merge'
import type { AnalysisRecord, VisionImage } from './types'

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
function toStageResult(record: AnalysisRecord): VisionStageResult {
  return {
    stage: record.stage,
    status: record.status === 'FAILED' ? 'FAILED' : 'OK',
    model: record.model,
    promptHash: record.promptHash,
    raw: record.rawJson,
    parsed: record.parsedJson,
    tokensIn: record.tokensIn,
    tokensOut: record.tokensOut,
    latencyMs: record.latencyMs,
    errorRef: record.errorRef,
  }
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
    if (classification.kind === 'UNKNOWN') {
      return {
        extractorVersion: VISION_PORT_VERSION,
        kind: 'UNKNOWN',
        intent: request.intent,
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

    return {
      extractorVersion: VISION_PORT_VERSION,
      kind: classification.kind as SourceImageKind,
      intent: merged.intent,
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
