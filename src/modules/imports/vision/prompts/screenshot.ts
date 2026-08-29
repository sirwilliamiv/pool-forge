// SCREENSHOT prompt version marker.
//
// A screenshot has no prompt of its own. It is routed: with a scale reference
// it is read by the site plan extractor, without one it is read by the concept
// render extractor and contributes intent only. The version constant exists so
// `ImageAnalysis` rows record which routing rule produced the row, and so a
// change to the routing is replayable over the corpus.

export const SCREENSHOT_EXTRACTOR_VERSION = 'screenshot@1.0.0'

/** How a screenshot was routed, recorded on the contribution's warnings. */
export const SCREENSHOT_ROUTES = ['sitePlan', 'conceptRender'] as const
export type ScreenshotRoute = (typeof SCREENSHOT_ROUTES)[number]
