import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  backoffDelayMs,
  createDisabledClient,
  createVisionClient,
  isLiveEnabled,
  isRetryable,
  loadVisionConfig,
  statusOf,
  VisionError,
  withRetries,
  type VisionConfig,
} from '@/modules/imports/vision'

const BASE_ENV = {
  GCP_PROJECT_ID: 'pool-forge-prod',
  VERTEX_LOCATION: 'us-east4',
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warn.mockRestore()
})

describe('loadVisionConfig', () => {
  it('reads project, location and models from the environment', () => {
    const config = loadVisionConfig({
      ...BASE_ENV,
      VERTEX_CLASSIFY_MODEL: 'gemini-2.5-flash-lite',
      VERTEX_EXTRACT_MODEL: 'gemini-2.5-pro',
      VERTEX_TIMEOUT_MS: '30000',
      VERTEX_MAX_ATTEMPTS: '2',
      VERTEX_LIVE: '1',
    })
    expect(config.projectId).toBe('pool-forge-prod')
    expect(config.location).toBe('us-east4')
    expect(config.classifyModel).toBe('gemini-2.5-flash-lite')
    expect(config.timeoutMs).toBe(30_000)
    expect(config.maxAttempts).toBe(2)
    expect(config.live).toBe(true)
  })

  it('defaults the location and the models but never the project id', () => {
    const config = loadVisionConfig({ GCP_PROJECT_ID: 'some-project' })
    expect(config.location).toBe('us-central1')
    expect(config.classifyModel.length).toBeGreaterThan(0)
    expect(config.extractModel.length).toBeGreaterThan(0)
    expect(config.live).toBe(false)
  })

  it.each([{}, { GCP_PROJECT_ID: '' }, { GCP_PROJECT_ID: '   ' }])(
    'fails loudly when the project id is missing (%o)',
    (env) => {
      let thrown: unknown
      try {
        loadVisionConfig(env)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(VisionError)
      expect((thrown as VisionError).code).toBe('config')
      expect((thrown as VisionError).message).not.toContain('GCP_PROJECT_ID')
    },
  )

  it('treats a bad numeric override as the default rather than NaN', () => {
    const config = loadVisionConfig({ ...BASE_ENV, VERTEX_TIMEOUT_MS: 'soon' })
    expect(config.timeoutMs).toBe(60_000)
  })
})

describe('live gating', () => {
  it('is off unless VERTEX_LIVE is exactly 1', () => {
    expect(isLiveEnabled({})).toBe(false)
    expect(isLiveEnabled({ VERTEX_LIVE: '0' })).toBe(false)
    expect(isLiveEnabled({ VERTEX_LIVE: 'true' })).toBe(false)
    expect(isLiveEnabled({ VERTEX_LIVE: '1' })).toBe(true)
  })

  it('hands back a client that refuses to call while billing is unlinked', async () => {
    const client = createVisionClient({ ...BASE_ENV })
    await expect(
      client.generate({ model: 'gemini-2.5-pro', prompt: 'x', stage: 'EXTRACT' }),
    ).rejects.toBeInstanceOf(VisionError)
  })

  it('the disabled client never leaks configuration detail', async () => {
    const client = createDisabledClient()
    const error = await client
      .generate({ model: 'gemini-2.5-pro', prompt: 'x', stage: 'EXTRACT' })
      .catch((err: unknown) => err)
    expect(error).toBeInstanceOf(VisionError)
    expect((error as VisionError).message).not.toContain('VERTEX_LIVE')
  })
})

describe('retry classification', () => {
  it.each([
    [{ status: 429 }, true],
    [{ status: 500 }, true],
    [{ status: 503 }, true],
    [{ status: 504 }, true],
    [{ response: { status: 502 } }, true],
    [{ status: 400 }, false],
    [{ status: 401 }, false],
    [{ status: 403 }, false],
    [{ status: 404 }, false],
  ])('classifies %o', (error, expected) => {
    expect(isRetryable(error)).toBe(expected)
  })

  it('retries transport level failures', () => {
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(isRetryable(abort)).toBe(true)
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    expect(isRetryable(reset)).toBe(true)
  })

  it('pulls a status out of the shapes the SDK throws', () => {
    expect(statusOf({ status: 429 })).toBe(429)
    expect(statusOf({ code: 503 })).toBe(503)
    expect(statusOf({ response: { status: 500 } })).toBe(500)
    expect(statusOf(new Error('nope'))).toBeNull()
  })
})

const config: VisionConfig = {
  projectId: 'p',
  location: 'us-central1',
  classifyModel: 'a',
  extractModel: 'b',
  timeoutMs: 1000,
  maxAttempts: 3,
  baseBackoffMs: 100,
  maxBackoffMs: 1000,
  live: true,
}

describe('withRetries', () => {
  const noSleep = async () => {}

  it('returns the first success without retrying', async () => {
    const fn = vi.fn(async () => 'ok')
    const result = await withRetries(fn, { config, stage: 'EXTRACT', model: 'm', sleepFn: noSleep })
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries a 429 up to the configured ceiling and no further', async () => {
    const fn = vi.fn(async () => {
      throw { status: 429 }
    })
    await expect(
      withRetries(fn, { config, stage: 'EXTRACT', model: 'm', sleepFn: noSleep }),
    ).rejects.toBeInstanceOf(VisionError)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not retry a 400', async () => {
    const fn = vi.fn(async () => {
      throw { status: 400, message: 'bad request with key AIzaSyLEAK' }
    })
    const error = await withRetries(fn, { config, stage: 'EXTRACT', model: 'm', sleepFn: noSleep }).catch(
      (err: unknown) => err,
    )
    expect(fn).toHaveBeenCalledTimes(1)
    expect((error as VisionError).message).not.toContain('AIzaSyLEAK')
  })

  it('recovers when a retry succeeds', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw { status: 503 }
      return 'recovered'
    })
    const result = await withRetries(fn, { config, stage: 'EXTRACT', model: 'm', sleepFn: noSleep })
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('reports a rate limit as its own code', async () => {
    const error = await withRetries(
      async () => {
        throw { status: 429 }
      },
      { config, stage: 'EXTRACT', model: 'm', sleepFn: noSleep },
    ).catch((err: unknown) => err)
    expect((error as VisionError).code).toBe('rate_limited')
  })

  it('backs off exponentially and stays under the ceiling', () => {
    expect(backoffDelayMs(1, config, 1)).toBe(100)
    expect(backoffDelayMs(2, config, 1)).toBe(200)
    expect(backoffDelayMs(3, config, 1)).toBe(400)
    expect(backoffDelayMs(9, config, 1)).toBe(1000)
    expect(backoffDelayMs(1, config, 0)).toBe(50)
  })
})
