// What the vision port does when classification declines to route an image.
//
// This used to be a completely silent early return: one CLASSIFY row, the
// caller's intent handed straight back, no warning and no second stage. The
// review screen rendered that as "1 of 3 stages" with fifteen empty fields and
// no explanation anywhere on the page, which a product owner reasonably read as
// the feature being broken. A stop is a result and has to be reported like one.

import { describe, expect, it, vi } from 'vitest'
import { emptyDesignIntent } from '@/modules/imports/intent'
import type { VisionCallRequest, VisionCallResult } from '@/modules/imports/vision/client'

const generate = vi.fn<(request: VisionCallRequest) => Promise<VisionCallResult>>()

vi.mock('@/modules/storage', () => ({
  getBlobStore: () => ({
    get: async () => Buffer.from('not-a-real-image'),
  }),
}))

vi.mock('@/modules/imports/vision/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/imports/vision/client')>()
  return { ...actual, createVisionClient: () => ({ generate }) }
})

const { UNROUTABLE_WARNING, vertexVisionAnalysisPort } = await import(
  '@/modules/imports/vision/port'
)

function classifiesAs(kind: string): void {
  generate.mockReset()
  generate.mockResolvedValue({
    text: JSON.stringify({ kind, rotationDeg: 0, qualityFlags: [], confidence: 0.9 }),
    usage: { model: 'gemini-2.5-flash', tokensIn: 10, tokensOut: 10, latencyMs: 1 },
  } as VisionCallResult)
}

const REQUEST = {
  orgId: 'org_1',
  sourceImageId: 'img_1',
  visionKey: 'vision/img_1',
  visionMimeType: 'image/png',
  widthPx: 600,
  heightPx: 400,
  kind: 'UNKNOWN' as const,
  intent: emptyDesignIntent(['img_1']),
}

describe('an image classification could not route', () => {
  it('says why the run stopped instead of returning the intent untouched', async () => {
    classifiesAs('UNKNOWN')
    const result = await vertexVisionAnalysisPort.analyze(REQUEST)

    expect(result.kind).toBe('UNKNOWN')
    expect(result.intent.warnings).toContain(UNROUTABLE_WARNING)
    expect(UNROUTABLE_WARNING).toMatch(/never ran/i)
  })

  it('calls the model once, because there is no extractor to call', async () => {
    classifiesAs('UNKNOWN')
    const result = await vertexVisionAnalysisPort.analyze(REQUEST)

    expect(generate).toHaveBeenCalledTimes(1)
    expect(result.stages.map((s) => s.stage)).toEqual(['CLASSIFY'])
  })

  it('does not repeat the warning when the same image is analysed again', async () => {
    classifiesAs('UNKNOWN')
    const once = await vertexVisionAnalysisPort.analyze(REQUEST)
    classifiesAs('UNKNOWN')
    const twice = await vertexVisionAnalysisPort.analyze({ ...REQUEST, intent: once.intent })

    expect(twice.intent.warnings.filter((w) => w === UNROUTABLE_WARNING)).toHaveLength(1)
  })
})
