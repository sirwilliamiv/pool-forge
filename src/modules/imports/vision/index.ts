// Track I2, the vision extraction layer.
//
// CLASSIFY routes an image to one of five extractors, each returns a partial
// DesignIntent plus an image-space geometry payload, and `mergeContributions`
// folds N images into the one contract the rest of the pipeline reads.
//
// Vertex AI only. No `responseSchema`. One repair round-trip, never two. No
// provider error text ever leaves this module.

export {
  backoffDelayMs,
  createDisabledClient,
  createVertexClient,
  createVisionClient,
  isLiveEnabled,
  isRetryable,
  loadVisionConfig,
  resetVertexClientCache,
  statusOf,
  VisionConfigSchema,
  withRetries,
  type EnvLike,
  type VisionCallRequest,
  type VisionCallResult,
  type VisionClient,
  type VisionConfig,
} from './client'

export { classifyImage, ClassificationResponseSchema, lacksScaleReference, type ClassifyResult } from './classify'

export {
  isErrorRef,
  logVisionWarning,
  newErrorRef,
  safeVisionError,
  scrubErrorText,
  userMessageFor,
  VisionError,
  type VisionErrorCode,
} from './errors'

export {
  assertNoGeometry,
  extractConceptRender,
  extractForKind,
  extractScreenshot,
  extractSitePhoto,
  extractSitePlan,
  extractSketch,
  FORBIDDEN_CONCEPT_PATHS,
  routeScreenshot,
  type ExtractionOutcome,
} from './extractors'

export { KIND_GEOMETRY_RANK, mergeContributions, type MergeResult } from './merge'

export { createRecordedClient, type RecordedClient, type RecordedResponse } from './recorded'

export { failedAnalysis, hashPrompt, runStructuredCall, type StructuredCallResult } from './runner'

export {
  parseDimension,
  parseDimensionToInches,
  parseScaleLegend,
  type LinearUnit,
} from './dimensions'

export * from './prompts'

export {
  addUsage,
  emptyUsage,
  IMAGE_KINDS,
  ImageKindSchema,
  QUALITY_FLAGS,
  QualityFlagSchema,
  NormalizedPointSchema,
  toPixels,
} from './types'

export type {
  AnalysisRecord,
  ClassificationResult,
  DimensionAnnotation,
  ExtractionGeometry,
  ImageKind,
  IntentContribution,
  NormalizedPoint,
  PartialDesignIntent,
  QualityFlag,
  ScaleLegend,
  SitePlanGeometry,
  SketchGeometry,
  VisionImage,
  VisionUsage,
} from './types'

export {
  VISION_PORT_VERSION,
  installVertexVisionPort,
  vertexVisionAnalysisPort,
} from './port'
