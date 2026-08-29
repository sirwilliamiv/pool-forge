// Thin Vertex AI client wrapper.
//
// Vertex AI only. The consumer `generativelanguage.googleapis.com` endpoint
// permits Google to use prompts for training and these are photographs of
// customers' homes, so the client is constructed with `vertexai: true` plus a
// GCP project and location and it authenticates through Application Default
// Credentials. There are no key files in this repo and no API-key path.
//
// The SDK is loaded through a dynamic import so that fixture-driven tests, the
// default mode, never pull the Google auth stack into the process.

import { z } from 'zod'
import type { GoogleGenAI } from '@google/genai'
import { safeVisionError, VisionError, logVisionWarning } from './errors'
import type { VisionUsage } from './types'

/* ------------------------------------------------------------------ config */

const DEFAULT_LOCATION = 'us-central1'
/** Cheap model for CLASSIFY, strong model for EXTRACT. See spec, cost control. */
// Gemini 3 Flash, on the global endpoint, which is the only place it is served.
// 2.5 Flash was the default and is a generation behind; it also spends a large
// part of a small output budget on thinking before it writes anything, so a
// tight `maxOutputTokens` came back empty rather than short.
const DEFAULT_CLASSIFY_MODEL = 'gemini-3-flash-preview'
const DEFAULT_EXTRACT_MODEL = 'gemini-2.5-pro'

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback
      const parsed = Number.parseInt(value.trim(), 10)
      return Number.isFinite(parsed) ? parsed : fallback
    })
    .pipe(z.number().int().positive())

/**
 * Config is validated at startup and fails loudly. A missing project id is not
 * defaulted to anything: a wrong project silently bills and, worse, silently
 * routes customer photographs somewhere unintended.
 */
export const VisionConfigSchema = z.object({
  projectId: z
    .string({ required_error: 'GCP_PROJECT_ID is required for Vertex AI image analysis' })
    .trim()
    .min(1, 'GCP_PROJECT_ID is required for Vertex AI image analysis'),
  location: z.string().trim().min(1).default(DEFAULT_LOCATION),
  classifyModel: z.string().trim().min(1).default(DEFAULT_CLASSIFY_MODEL),
  extractModel: z.string().trim().min(1).default(DEFAULT_EXTRACT_MODEL),
  timeoutMs: z.number().int().positive().default(60_000),
  maxAttempts: z.number().int().min(1).max(6).default(3),
  baseBackoffMs: z.number().int().positive().default(500),
  maxBackoffMs: z.number().int().positive().default(8_000),
  /** Live calls are opt-in. Billing is not linked on `pool-forge-prod` yet. */
  live: z.boolean().default(false),
})
export type VisionConfig = z.infer<typeof VisionConfigSchema>

export type EnvLike = Record<string, string | undefined>

const RawEnvSchema = z.object({
  GCP_PROJECT_ID: z.string().trim().min(1, 'GCP_PROJECT_ID is required for Vertex AI image analysis'),
  VERTEX_LOCATION: z.string().trim().min(1).optional(),
  VERTEX_CLASSIFY_MODEL: z.string().trim().min(1).optional(),
  VERTEX_EXTRACT_MODEL: z.string().trim().min(1).optional(),
  VERTEX_TIMEOUT_MS: intFromEnv(60_000),
  VERTEX_MAX_ATTEMPTS: intFromEnv(3),
  VERTEX_LIVE: z.string().optional(),
})

/**
 * Read and validate config from an env bag. Throws a `VisionError` with code
 * `config` when anything is missing; the underlying Zod message is logged, not
 * returned, so a misconfiguration cannot echo infrastructure detail to a user.
 */
export function loadVisionConfig(env: EnvLike = process.env): VisionConfig {
  const parsed = RawEnvSchema.safeParse(env)
  if (!parsed.success) {
    throw safeVisionError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'config', {
      stage: 'config',
    })
  }
  const raw = parsed.data
  const candidate: Record<string, unknown> = {
    projectId: raw.GCP_PROJECT_ID,
    timeoutMs: raw.VERTEX_TIMEOUT_MS,
    maxAttempts: raw.VERTEX_MAX_ATTEMPTS,
    live: raw.VERTEX_LIVE === '1',
  }
  if (raw.VERTEX_LOCATION !== undefined) candidate.location = raw.VERTEX_LOCATION
  if (raw.VERTEX_CLASSIFY_MODEL !== undefined) candidate.classifyModel = raw.VERTEX_CLASSIFY_MODEL
  if (raw.VERTEX_EXTRACT_MODEL !== undefined) candidate.extractModel = raw.VERTEX_EXTRACT_MODEL

  const config = VisionConfigSchema.safeParse(candidate)
  if (!config.success) {
    throw safeVisionError(config.error.message, 'config', { stage: 'config' })
  }
  return config.data
}

/** True when live Vertex calls are enabled. Everything else replays fixtures. */
export function isLiveEnabled(env: EnvLike = process.env): boolean {
  return env.VERTEX_LIVE === '1'
}

/* ------------------------------------------------------------ client shape */

export interface VisionCallRequest {
  model: string
  prompt: string
  /** Omitted on a repair round-trip: the image is already in the transcript. */
  image?: { base64: string; mimeType: string }
  /** Prior turns, used only by the single repair round-trip. */
  history?: { role: 'user' | 'model'; text: string }[]
  temperature?: number
  maxOutputTokens?: number
  stage: string
  sourceImageId?: string
}

export interface VisionCallResult {
  text: string
  usage: VisionUsage
}

export interface VisionClient {
  generate(request: VisionCallRequest): Promise<VisionCallResult>
}

/* ------------------------------------------------------------------ retry */

const RETRYABLE_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504])

/** Pull an HTTP status out of whatever shape the SDK threw. */
export function statusOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const record = error as Record<string, unknown>
  for (const key of ['status', 'code', 'statusCode']) {
    const value = record[key]
    if (typeof value === 'number' && value >= 100 && value < 600) return value
  }
  const response = record.response
  if (typeof response === 'object' && response !== null) {
    const status = (response as Record<string, unknown>).status
    if (typeof status === 'number') return status
  }
  return null
}

export function isRetryable(error: unknown): boolean {
  const status = statusOf(error)
  if (status !== null) return RETRYABLE_STATUSES.has(status)
  if (error instanceof Error) {
    const name = error.name.toLowerCase()
    if (name === 'aborterror' || name === 'timeouterror') return true
    const code = (error as unknown as Record<string, unknown>).code
    if (typeof code === 'string' && ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) {
      return true
    }
  }
  return false
}

export function backoffDelayMs(attempt: number, config: VisionConfig, jitter = Math.random()): number {
  const exponential = config.baseBackoffMs * 2 ** (attempt - 1)
  const capped = Math.min(exponential, config.maxBackoffMs)
  return Math.round(capped * (0.5 + jitter * 0.5))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export interface RetryOptions {
  config: VisionConfig
  stage: string
  model: string
  sourceImageId?: string | undefined
  sleepFn?: (ms: number) => Promise<void>
  jitterFn?: () => number
}

/**
 * Bounded retry with exponential backoff. Retries 429 and 5xx only; a 400 or a
 * 403 is a bug or a permission problem and retrying it just burns quota.
 */
export async function withRetries<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const { config } = options
  const sleepFn = options.sleepFn ?? sleep
  const jitterFn = options.jitterFn ?? Math.random
  let lastError: unknown

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      const retryable = isRetryable(error)
      const status = statusOf(error)
      logVisionWarning('vision_call_failed', {
        stage: options.stage,
        model: options.model,
        attempt,
        maxAttempts: config.maxAttempts,
        status: status ?? 'unknown',
        retryable,
        sourceImageId: options.sourceImageId ?? null,
        cause: error instanceof Error ? error.message : String(error),
      })
      if (!retryable || attempt === config.maxAttempts) break
      await sleepFn(backoffDelayMs(attempt, config, jitterFn()))
    }
  }

  const status = statusOf(lastError)
  const code = status === 429 ? 'rate_limited' : status === null && isRetryable(lastError) ? 'timeout' : 'transport'
  const context: { stage: string; model: string; sourceImageId?: string } = {
    stage: options.stage,
    model: options.model,
  }
  if (options.sourceImageId !== undefined) context.sourceImageId = options.sourceImageId
  throw safeVisionError(lastError, code, context)
}

/* ------------------------------------------------------------ live client */

type GenAiModule = typeof import('@google/genai')

let cachedClient: GoogleGenAI | null = null
let cachedKey = ''

async function getGenAi(config: VisionConfig): Promise<GoogleGenAI> {
  const key = `${config.projectId}:${config.location}`
  if (cachedClient !== null && cachedKey === key) return cachedClient
  const mod: GenAiModule = await import('@google/genai')
  cachedClient = new mod.GoogleGenAI({
    vertexai: true,
    project: config.projectId,
    location: config.location,
  })
  cachedKey = key
  return cachedClient
}

/** Test seam: drop the memoized SDK client. */
export function resetVertexClientCache(): void {
  cachedClient = null
  cachedKey = ''
}

/**
 * The real Vertex client. Not constructed unless `VERTEX_LIVE=1`, because
 * billing is not linked on the target project yet and an unbilled call fails in
 * a way that looks like a code bug.
 */
export function createVertexClient(config: VisionConfig): VisionClient {
  return {
    async generate(request: VisionCallRequest): Promise<VisionCallResult> {
      return withRetries(
        async () => {
          const ai = await getGenAi(config)
          const started = Date.now()

          const image = request.image
          const inlinePart: Record<string, unknown> | null =
            image === undefined ? null : { inlineData: { data: image.base64, mimeType: image.mimeType } }
          const contents: { role: 'user' | 'model'; parts: Record<string, unknown>[] }[] = []
          const history = request.history ?? []
          if (history.length === 0) {
            const parts: Record<string, unknown>[] = []
            if (inlinePart !== null) parts.push(inlinePart)
            parts.push({ text: request.prompt })
            contents.push({ role: 'user', parts })
          } else {
            // Repair turn: the image rides on the first user turn only.
            history.forEach((turn, index) => {
              const parts: Record<string, unknown>[] = []
              if (index === 0 && inlinePart !== null) parts.push(inlinePart)
              parts.push({ text: turn.text })
              contents.push({ role: turn.role, parts })
            })
            contents.push({ role: 'user', parts: [{ text: request.prompt }] })
          }

          // No `responseSchema`. Gemini's JSON-Schema subset cannot express the
          // nested and union-ish shapes here and silently emits `{}` for the
          // affected fields; we prompt for JSON and validate with Zod instead.
          const generationConfig: Record<string, unknown> = {
            temperature: request.temperature ?? 0,
            responseMimeType: 'application/json',
            httpOptions: { timeout: config.timeoutMs },
          }
          if (request.maxOutputTokens !== undefined) {
            generationConfig.maxOutputTokens = request.maxOutputTokens
          }

          const response = await ai.models.generateContent({
            model: request.model,
            contents,
            config: generationConfig,
          })

          const latencyMs = Date.now() - started
          const usageMeta = response.usageMetadata
          return {
            text: response.text ?? '',
            usage: {
              model: response.modelVersion ?? request.model,
              tokensIn: usageMeta?.promptTokenCount ?? 0,
              tokensOut: (usageMeta?.candidatesTokenCount ?? 0) + (usageMeta?.thoughtsTokenCount ?? 0),
              latencyMs,
              calls: 1,
            },
          }
        },
        {
          config,
          stage: request.stage,
          model: request.model,
          sourceImageId: request.sourceImageId,
        },
      )
    },
  }
}

/**
 * A client that refuses to call anything. This is the default while billing is
 * unlinked on `pool-forge-prod`: callers get a safe, greppable failure rather
 * than a confusing auth error from deep inside the SDK.
 */
export function createDisabledClient(): VisionClient {
  return {
    async generate(request: VisionCallRequest): Promise<VisionCallResult> {
      throw safeVisionError(
        'live Vertex calls are disabled; set VERTEX_LIVE=1 once billing is linked',
        'config',
        { stage: request.stage, model: request.model },
      )
    },
  }
}

/** Pick the live client or the disabled one based on `VERTEX_LIVE`. */
export function createVisionClient(env: EnvLike = process.env): VisionClient {
  if (!isLiveEnabled(env)) return createDisabledClient()
  return createVertexClient(loadVisionConfig(env))
}

export { VisionError }
