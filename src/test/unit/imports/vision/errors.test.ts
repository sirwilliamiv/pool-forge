import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isErrorRef,
  logVisionWarning,
  newErrorRef,
  safeVisionError,
  scrubErrorText,
  userMessageFor,
  VisionError,
} from '@/modules/imports/vision'

/** Realistic shapes of the text a Google API error can carry. */
const HOSTILE_ERRORS = [
  'Request had invalid authentication credentials. Bearer ya29.a0AfB_byC3xample-token-material-here expected OAuth 2 access token',
  'API key AIzaSyD-EXAMPLE-KEY-MATERIAL-abcdefg not valid. Please pass a valid API key.',
  'Error calling https://us-central1-aiplatform.googleapis.com/v1/projects/p/locations/l:generateContent?key=SECRET_VALUE from 10.128.0.7',
  'JWT eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk was rejected',
  'quota exceeded for project 764613501658, contact billing-owner@example.com',
  'Invalid request: {"contents":[{"parts":[{"inlineData":{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk","mimeType":"image/png"}}]}]}',
  '-----BEGIN PRIVATE KEY-----MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ-----END PRIVATE KEY-----',
]

describe('correlation refs', () => {
  it('produces err_ plus exactly 12 hex characters', () => {
    for (let i = 0; i < 50; i += 1) {
      const ref = newErrorRef()
      expect(ref).toMatch(/^err_[0-9a-f]{12}$/)
      expect(isErrorRef(ref)).toBe(true)
    }
  })

  it('rejects anything that is not the ref format', () => {
    expect(isErrorRef('err_ABCDEF123456')).toBe(false)
    expect(isErrorRef('err_12345')).toBe(false)
    expect(isErrorRef('123456789abc')).toBe(false)
  })
})

describe('scrubErrorText', () => {
  it.each(HOSTILE_ERRORS)('removes credential material from %#', (raw) => {
    const scrubbed = scrubErrorText(raw)
    expect(scrubbed).not.toContain('ya29.')
    expect(scrubbed).not.toContain('AIzaSy')
    expect(scrubbed).not.toContain('SECRET_VALUE')
    expect(scrubbed).not.toContain('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9')
    expect(scrubbed).not.toContain('billing-owner@example.com')
    expect(scrubbed).not.toContain('10.128.0.7')
    expect(scrubbed).not.toContain('BEGIN PRIVATE KEY-----MIIEvQ')
  })

  it('caps runaway text so a whole request body cannot reach a log', () => {
    const scrubbed = scrubErrorText('x'.repeat(50_000))
    expect(scrubbed.length).toBeLessThan(700)
    expect(scrubbed.endsWith('...[truncated]')).toBe(true)
  })

  it('handles non-string, non-Error input', () => {
    expect(scrubErrorText({ status: 503 })).toContain('503')
    expect(scrubErrorText(undefined)).toBe('[unserializable]')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(scrubErrorText(circular)).toBe('[unserializable]')
  })
})

describe('safeVisionError', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it.each(HOSTILE_ERRORS)('never lets raw provider text reach the caller (%#)', (raw) => {
    const error = safeVisionError(new Error(raw), 'transport', { stage: 'EXTRACT', model: 'gemini-2.5-pro' })
    expect(error).toBeInstanceOf(VisionError)
    expect(error.message).toBe(userMessageFor('transport'))
    expect(error.message).not.toContain('ya29')
    expect(error.message).not.toContain('AIzaSy')
    expect(error.message).not.toContain('googleapis.com')
    expect(JSON.stringify(error)).not.toContain('AIzaSy')
    expect(isErrorRef(error.errorRef)).toBe(true)
  })

  it('logs the scrubbed cause at warn, keyed on the same ref', () => {
    const error = safeVisionError(
      new Error('API key AIzaSyD-EXAMPLE-KEY-MATERIAL-abcdefg not valid'),
      'config',
      { stage: 'config' },
    )
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0]?.[0] ?? '')
    expect(line).toContain(error.errorRef)
    expect(line).toContain('[redacted-key]')
    expect(line).not.toContain('AIzaSyD-EXAMPLE-KEY-MATERIAL-abcdefg')
  })

  it('returns an existing VisionError unchanged so refs stay stable', () => {
    const first = safeVisionError('boom', 'timeout', { stage: 'EXTRACT' })
    const second = safeVisionError(first, 'transport', { stage: 'EXTRACT' })
    expect(second).toBe(first)
    expect(second.code).toBe('timeout')
  })

  it('scrubs string fields passed to the structured logger', () => {
    logVisionWarning('test_event', { note: 'token=abc123secret', count: 3 })
    const line = String(warn.mock.calls[0]?.[0] ?? '')
    expect(line).not.toContain('abc123secret')
    expect(line).toContain('"count":3')
  })
})
