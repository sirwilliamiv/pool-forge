// Versioned prompt registry.
//
// `ImageAnalysis` rows key on `(sourceImageId, stage, extractorVersion)`, so
// every prompt carries a version constant and every version bump re-runs and
// stays replayable. Prompts are string constants, never built by string
// concatenation at call time, so the hash of a prompt identifies it exactly.

export { CLASSIFY_EXTRACTOR_VERSION, CLASSIFY_PROMPT } from './classify'
export { SKETCH_EXTRACTOR_VERSION, SKETCH_PROMPT } from './sketch'
export { SITE_PLAN_EXTRACTOR_VERSION, SITE_PLAN_PROMPT } from './sitePlan'
export { CONCEPT_RENDER_EXTRACTOR_VERSION, CONCEPT_RENDER_PROMPT } from './conceptRender'
export { SITE_PHOTO_EXTRACTOR_VERSION, SITE_PHOTO_PROMPT } from './sitePhoto'
export { SCREENSHOT_EXTRACTOR_VERSION, SCREENSHOT_ROUTES, type ScreenshotRoute } from './screenshot'
export { REPAIR_PROMPT_VERSION, buildRepairPrompt, previousModelTurn } from './repair'
