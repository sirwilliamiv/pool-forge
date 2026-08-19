// The vision port.
//
// `import.image.analyze` owns the durable half of analysis: org scoping, the
// `(sourceImageId, stage, extractorVersion)` cache, the `ImageAnalysis` rows,
// and folding the result back into the session's `DesignIntent`. It owns none
// of the model half.
//
// Track I2 builds the model half in `src/modules/imports/vision/` and registers
// it here. Neither track edits the other's files: I1 depends on this interface,
// I2 depends on this interface, and the default implementation is a no-op so
// the command is honest and green before I2 lands.
//
// Everything crossing the port is JSON-serialisable except the intent itself,
// which is the DesignIntent v1 contract. No Prisma types, no blob buffers, no
// Vertex SDK types: the port must stay implementable by a fake in a test.

import type { DesignIntent } from './intent'

export const ANALYSIS_STAGES = ['CLASSIFY', 'EXTRACT', 'CALIBRATE', 'TRANSLATE'] as const
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number]

export const ANALYSIS_STATUSES = ['PENDING', 'OK', 'FAILED'] as const
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number]

export const SOURCE_IMAGE_KINDS = [
  'SKETCH',
  'SITE_PLAN',
  'CONCEPT_RENDER',
  'SITE_PHOTO',
  'SCREENSHOT',
  'UNKNOWN',
] as const
export type SourceImageKind = (typeof SOURCE_IMAGE_KINDS)[number]

export interface VisionAnalysisRequest {
  orgId: string
  sourceImageId: string
  /**
   * BlobStore key of the copy already downscaled to `VISION_MAX_EDGE_PX` on the
   * long edge, EXIF stripped, ready to send. Read it with `getBlobStore()`.
   */
  visionKey: string
  /** MIME type of the blob at `visionKey`, not of the user's upload. */
  visionMimeType: string
  /** Pixel dimensions of the stored original, after orientation was applied. */
  widthPx: number
  heightPx: number
  /** Kind already on the row. `UNKNOWN` until the classifier has run. */
  kind: SourceImageKind
  /** The session's intent so far. The port returns the merged result. */
  intent: DesignIntent
}

/** One persisted `ImageAnalysis` row's worth of result. */
export interface VisionStageResult {
  stage: AnalysisStage
  status: AnalysisStatus
  model: string
  promptHash: string
  /** Raw model response, stored verbatim so a prompt change is replayable. */
  raw: unknown
  /** Zod-validated payload, or `{}` when validation dropped it. */
  parsed: unknown
  tokensIn: number
  tokensOut: number
  latencyMs: number
  /**
   * `err_<12 hex>` correlation ref for a server-logged failure. Never raw
   * provider error text: that can carry key fragments, tokens, or PII.
   */
  errorRef: string | null
}

export interface VisionAnalysisResult {
  /** Bumped whenever a prompt or parser changes. Keys the analysis cache. */
  extractorVersion: string
  /** Classification result. Written back onto `SourceImage.kind`. */
  kind: SourceImageKind
  /** The intent after this image's contribution has been merged in. */
  intent: DesignIntent
  /** One entry per stage attempted. Persisted one row each. */
  stages: VisionStageResult[]
}

export interface VisionAnalysisPort {
  /** Default version stamped on cache rows when the caller does not pin one. */
  readonly extractorVersion: string
  analyze(request: VisionAnalysisRequest): Promise<VisionAnalysisResult>
}

/**
 * The default. Persists a PENDING row and changes nothing, so the command path,
 * the cache key, and the audit trail are all exercised before Track I2 lands.
 */
export const NOOP_EXTRACTOR_VERSION = 'noop-v0'

export const noopVisionAnalysisPort: VisionAnalysisPort = {
  extractorVersion: NOOP_EXTRACTOR_VERSION,
  analyze: async (request) => ({
    extractorVersion: NOOP_EXTRACTOR_VERSION,
    kind: request.kind,
    intent: {
      ...request.intent,
      warnings: [...request.intent.warnings, 'No vision extractor is configured.'],
    },
    stages: [
      {
        stage: 'CLASSIFY',
        status: 'PENDING',
        model: 'noop',
        promptHash: 'noop',
        raw: {},
        parsed: {},
        tokensIn: 0,
        tokensOut: 0,
        latencyMs: 0,
        errorRef: null,
      },
    ],
  }),
}

let installed: VisionAnalysisPort | null = null

/** Track I2 calls this once at module load to take over analysis. */
export function setVisionAnalysisPort(port: VisionAnalysisPort | null): void {
  installed = port
}

export function getVisionAnalysisPort(): VisionAnalysisPort {
  return installed ?? noopVisionAnalysisPort
}
