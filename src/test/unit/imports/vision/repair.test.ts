import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecordedClient, extractSketch, VisionError } from '@/modules/imports/vision'
import { fixture, testImage } from './helpers'

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

const image = testImage()

describe('the one repair round-trip', () => {
  it('does not fire at all when the first response validates', async () => {
    const client = createRecordedClient([fixture('sketch-good')])
    const result = await extractSketch({ client, image, model: 'gemini-2.5-pro' })
    expect(client.callCount).toBe(1)
    expect(result.repaired).toBe(false)
    expect(result.analysis.status).toBe('OK')
  })

  it.each(['sketch-invalid-zod', 'sketch-truncated', 'empty-object'])(
    'fires exactly once after a %s response and stops there',
    async (badFixture) => {
      const client = createRecordedClient([fixture(badFixture), fixture('sketch-good')])
      const result = await extractSketch({ client, image, model: 'gemini-2.5-pro' })
      expect(client.callCount).toBe(2)
      expect(result.repaired).toBe(true)
      expect(result.analysis.status).toBe('REPAIRED')
      expect(result.contribution.intent.pool?.shapeFamily).toBe('rectangle')
    },
  )

  it('never fires twice: two bad responses fail rather than looping', async () => {
    const client = createRecordedClient([fixture('empty-object'), fixture('sketch-invalid-zod')])
    const error = await extractSketch({ client, image, model: 'gemini-2.5-pro' }).catch((err: unknown) => err)
    // Two calls, not three. The recorded client throws a plain Error if a third
    // is attempted, so a VisionError here proves the loop is bounded.
    expect(client.callCount).toBe(2)
    expect(error).toBeInstanceOf(VisionError)
    expect((error as VisionError).code).toBe('schema_validation')
  })

  it('feeds the model its own output plus the rejection reason, with the image only once', async () => {
    const client = createRecordedClient([fixture('sketch-invalid-zod'), fixture('sketch-good')])
    await extractSketch({ client, image, model: 'gemini-2.5-pro' })

    const repair = client.requests[1]
    expect(repair).toBeDefined()
    expect(repair?.history).toHaveLength(2)
    expect(repair?.history?.[1]?.role).toBe('model')
    expect(repair?.history?.[1]?.text).toContain('oblong')
    expect(repair?.prompt).toContain('Your previous response was rejected')
    expect(repair?.prompt).toContain('shapeFamily')
  })

  it('logs every drop at warn with the raw response and the reason', async () => {
    const client = createRecordedClient([fixture('sketch-invalid-zod'), fixture('sketch-good')])
    await extractSketch({ client, image, model: 'gemini-2.5-pro' })

    const drops = warn.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((line) => line.includes('vision_validation_drop'))
    expect(drops).toHaveLength(1)
    const line = drops[0] ?? ''
    expect(line).toContain('"attempt":1')
    expect(line).toContain('oblong')
    expect(line).toContain('shapeFamily')
  })

  it('sums usage across both turns so the analysis row bills honestly', async () => {
    const client = createRecordedClient([
      { text: fixture('sketch-invalid-zod'), usage: { tokensIn: 1200, tokensOut: 400, latencyMs: 900 } },
      { text: fixture('sketch-good'), usage: { tokensIn: 1500, tokensOut: 650, latencyMs: 1100 } },
    ])
    const result = await extractSketch({ client, image, model: 'gemini-2.5-pro' })
    expect(result.contribution.usage.tokensIn).toBe(2700)
    expect(result.contribution.usage.tokensOut).toBe(1050)
    expect(result.contribution.usage.latencyMs).toBe(2000)
    expect(result.contribution.usage.calls).toBe(2)
    expect(result.analysis.tokensIn).toBe(2700)
    expect(result.analysis.model).toBe('gemini-2.5-pro')
    expect(result.analysis.promptHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('surfaces a safe error, never the model output, when the repair also fails', async () => {
    const client = createRecordedClient([fixture('sketch-truncated'), fixture('sketch-truncated')])
    const error = await extractSketch({ client, image, model: 'gemini-2.5-pro' }).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(VisionError)
    expect((error as VisionError).message).not.toContain('lshape')
    expect((error as VisionError).message).not.toContain('poolPolygon')
  })
})
