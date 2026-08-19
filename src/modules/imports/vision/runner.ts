// Prompt, parse, validate, repair once. The one place a model response becomes
// a typed value.
//
// No `responseSchema` is ever sent. Gemini's JSON-Schema subset cannot express
// the nested and union-ish shapes this pipeline needs and silently emits `{}`
// for the affected fields, and a test that mocks the model does not catch it.
// So: prompt for JSON, parse defensively, validate with Zod, and on failure
// spend exactly one repair round-trip.

import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type { VisionCallRequest, VisionClient } from './client'
import { logVisionWarning, safeVisionError, VisionError } from './errors'
import { describeParseFailure, parseModelJson } from './json'
import { buildRepairPrompt, previousModelTurn } from './prompts/repair'
import { addUsage, emptyUsage, type AnalysisRecord, type VisionImage, type VisionUsage } from './types'

/** Raw model text is truncated before it is logged. Prompts are not secrets, responses may echo one. */
const MAX_LOGGED_RESPONSE = 2_000

export interface StructuredCallOptions<T> {
  client: VisionClient
  model: string
  prompt: string
  /** Versioned prompt id, for example `sketch@1.0.0`. Keys the analysis row. */
  extractorVersion: string
  schema: z.ZodType<T>
  image: VisionImage
  stage: 'CLASSIFY' | 'EXTRACT'
  temperature?: number
  maxOutputTokens?: number
}

export interface StructuredCallResult<T> {
  data: T
  raw: string
  /** True when the first response was rejected and the one repair turn was used. */
  repaired: boolean
  usage: VisionUsage
  analysis: AnalysisRecord
}

export function hashPrompt(prompt: string): string {
  return createHash('sha256').update(prompt, 'utf8').digest('hex')
}

function truncateForLog(text: string): string {
  if (text.length <= MAX_LOGGED_RESPONSE) return text
  return `${text.slice(0, MAX_LOGGED_RESPONSE)}...[truncated ${text.length - MAX_LOGGED_RESPONSE} chars]`
}

function issueLines(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length === 0 ? '(root)' : issue.path.join('.')
    return `${path}: ${issue.message}`
  })
}

interface Rejection {
  problem: string
  issues: string[]
  kind: 'parse' | 'schema'
}

function evaluate<T>(raw: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; rejection: Rejection } {
  const parsed = parseModelJson(raw)
  if (!parsed.ok) {
    return {
      ok: false,
      rejection: { problem: describeParseFailure(parsed.reason), issues: [], kind: 'parse' },
    }
  }
  const validated = schema.safeParse(parsed.value)
  if (!validated.success) {
    return {
      ok: false,
      rejection: {
        problem: 'the JSON parsed but did not match the required shape',
        issues: issueLines(validated.error),
        kind: 'schema',
      },
    }
  }
  return { ok: true, data: validated.data }
}

/**
 * Run one structured extraction. At most two model turns: the original and, if
 * the first is rejected, exactly one repair. Every rejection is logged at warn
 * with the raw response and the reason, because a drop logged at debug is
 * invisible in production and the feature degrades into silence.
 */
export async function runStructuredCall<T>(options: StructuredCallOptions<T>): Promise<StructuredCallResult<T>> {
  const { client, model, prompt, schema, image, stage, extractorVersion } = options
  const promptHash = hashPrompt(prompt)
  let usage: VisionUsage = emptyUsage(model)

  const baseRequest: VisionCallRequest = {
    model,
    prompt,
    image: { base64: image.base64, mimeType: image.mimeType },
    stage,
    sourceImageId: image.sourceImageId,
    temperature: options.temperature ?? 0,
  }
  const firstRequest: VisionCallRequest = { ...baseRequest }
  if (options.maxOutputTokens !== undefined) firstRequest.maxOutputTokens = options.maxOutputTokens

  const first = await client.generate(firstRequest)
  usage = addUsage(usage, first.usage)

  const firstResult = evaluate(first.text, schema)
  if (firstResult.ok) {
    return {
      data: firstResult.data,
      raw: first.text,
      repaired: false,
      usage,
      analysis: buildAnalysis({
        image,
        stage,
        extractorVersion,
        promptHash,
        usage,
        raw: first.text,
        parsed: firstResult.data,
        status: 'OK',
      }),
    }
  }

  logVisionWarning('vision_validation_drop', {
    stage,
    extractorVersion,
    model,
    sourceImageId: image.sourceImageId,
    attempt: 1,
    rejection: firstResult.rejection.kind,
    reason: firstResult.rejection.problem,
    issues: firstResult.rejection.issues.slice(0, 20),
    rawResponse: truncateForLog(first.text),
  })

  // The one repair round-trip. There is no second.
  const repairRequest: VisionCallRequest = {
    model,
    prompt: buildRepairPrompt({
      problem: firstResult.rejection.problem,
      issues: firstResult.rejection.issues,
    }),
    image: { base64: image.base64, mimeType: image.mimeType },
    history: [
      { role: 'user', text: prompt },
      { role: 'model', text: previousModelTurn(first.text) },
    ],
    stage,
    sourceImageId: image.sourceImageId,
    temperature: 0,
  }
  if (options.maxOutputTokens !== undefined) repairRequest.maxOutputTokens = options.maxOutputTokens

  const second = await client.generate(repairRequest)
  usage = addUsage(usage, second.usage)

  const secondResult = evaluate(second.text, schema)
  if (secondResult.ok) {
    return {
      data: secondResult.data,
      raw: second.text,
      repaired: true,
      usage,
      analysis: buildAnalysis({
        image,
        stage,
        extractorVersion,
        promptHash,
        usage,
        raw: second.text,
        parsed: secondResult.data,
        status: 'REPAIRED',
      }),
    }
  }

  logVisionWarning('vision_validation_drop', {
    stage,
    extractorVersion,
    model,
    sourceImageId: image.sourceImageId,
    attempt: 2,
    rejection: secondResult.rejection.kind,
    reason: secondResult.rejection.problem,
    issues: secondResult.rejection.issues.slice(0, 20),
    rawResponse: truncateForLog(second.text),
    repairExhausted: true,
  })

  throw safeVisionError(
    `${stage} ${extractorVersion}: ${secondResult.rejection.problem}`,
    secondResult.rejection.kind === 'schema' ? 'schema_validation' : 'invalid_response',
    { stage, model, sourceImageId: image.sourceImageId, attempt: 2 },
  )
}

interface BuildAnalysisInput<T> {
  image: VisionImage
  stage: 'CLASSIFY' | 'EXTRACT'
  extractorVersion: string
  promptHash: string
  usage: VisionUsage
  raw: string
  parsed: T
  status: 'OK' | 'REPAIRED'
}

function buildAnalysis<T>(input: BuildAnalysisInput<T>): AnalysisRecord {
  let parsedJson: string | null
  try {
    parsedJson = JSON.stringify(input.parsed)
  } catch {
    parsedJson = null
  }
  return {
    sourceImageId: input.image.sourceImageId,
    stage: input.stage,
    extractorVersion: input.extractorVersion,
    model: input.usage.model,
    promptHash: input.promptHash,
    rawJson: input.raw,
    parsedJson,
    tokensIn: input.usage.tokensIn,
    tokensOut: input.usage.tokensOut,
    latencyMs: input.usage.latencyMs,
    status: input.status,
    errorRef: null,
  }
}

/** Build the `ImageAnalysis` row for a call that failed outright. */
export function failedAnalysis(input: {
  sourceImageId: string
  stage: 'CLASSIFY' | 'EXTRACT'
  extractorVersion: string
  model: string
  promptHash: string
  error: VisionError
}): AnalysisRecord {
  return {
    sourceImageId: input.sourceImageId,
    stage: input.stage,
    extractorVersion: input.extractorVersion,
    model: input.model,
    promptHash: input.promptHash,
    rawJson: '',
    parsedJson: null,
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 0,
    status: 'FAILED',
    errorRef: input.error.errorRef,
  }
}
