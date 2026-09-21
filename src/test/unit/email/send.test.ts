// @vitest-environment node
//
// Tests for the email module, particularly the HTML support and honest
// not-configured behavior.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { emailConfigured, sendEmail, maskAddress } from '@/modules/email/send'

const ENV_VARS = ['RESEND_API_KEY', 'EMAIL_FROM']
const saved = new Map<string, string | undefined>()

beforeEach(() => {
  for (const key of ENV_VARS) {
    saved.set(key, process.env[key])
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of ENV_VARS) {
    const value = saved.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.restoreAllMocks()
})

describe('emailConfigured', () => {
  it('returns false when both vars are unset', () => {
    expect(emailConfigured()).toBe(false)
  })

  it('returns false when only API key is set', () => {
    process.env.RESEND_API_KEY = 'test-key'
    expect(emailConfigured()).toBe(false)
  })

  it('returns false when only FROM is set', () => {
    process.env.EMAIL_FROM = 'test@example.com'
    expect(emailConfigured()).toBe(false)
  })

  it('returns true when both are set', () => {
    process.env.RESEND_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'test@example.com'
    expect(emailConfigured()).toBe(true)
  })
})

describe('sendEmail when not configured', () => {
  it('returns not-configured and does not touch the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    const result = await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      text: 'Plain text body',
    })

    expect(result).toEqual({ delivered: false, reason: 'not-configured' })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledTimes(1)
    const logArg = consoleSpy.mock.calls[0]?.[0]
    expect(typeof logArg).toBe('string')
    const logged = JSON.parse(logArg as string)
    expect(logged.scope).toBe('email')
    expect(logged.event).toBe('not_sent')
    expect(logged.hasHtml).toBe(false)
  })

  it('logs hasHtml: true when html is provided', async () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    await sendEmail({
      to: 'test@example.com',
      subject: 'Test',
      text: 'Plain text body',
      html: '<p>HTML body</p>',
    })

    const logArg = consoleSpy.mock.calls[0]?.[0]
    const logged = JSON.parse(logArg as string)
    expect(logged.hasHtml).toBe(true)
  })
})

describe('sendEmail when configured', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-api-key'
    process.env.EMAIL_FROM = 'Pool Forge <noreply@pool-forge.com>'
  })

  it('sends text-only email to Resend', async () => {
    let capturedBody: Record<string, unknown> | null = null
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'test-id' }), { status: 200 })
    })

    const result = await sendEmail({
      to: 'builder@example.com',
      subject: 'Welcome',
      text: 'Welcome to Pool Forge.',
    })

    expect(result).toEqual({ delivered: true, provider: 'resend' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(capturedBody).toMatchObject({
      from: 'Pool Forge <noreply@pool-forge.com>',
      to: ['builder@example.com'],
      subject: 'Welcome',
      text: 'Welcome to Pool Forge.',
    })
    expect(capturedBody).not.toHaveProperty('html')
  })

  it('sends both text and html when html is provided', async () => {
    let capturedBody: Record<string, unknown> | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(JSON.stringify({ id: 'test-id' }), { status: 200 })
    })

    const result = await sendEmail({
      to: 'builder@example.com',
      subject: 'Welcome',
      text: 'Welcome to Pool Forge.',
      html: '<h1>Welcome to Pool Forge</h1><p>We are glad you are here.</p>',
    })

    expect(result).toEqual({ delivered: true, provider: 'resend' })
    expect(capturedBody).toMatchObject({
      from: 'Pool Forge <noreply@pool-forge.com>',
      to: ['builder@example.com'],
      subject: 'Welcome',
      text: 'Welcome to Pool Forge.',
      html: '<h1>Welcome to Pool Forge</h1><p>We are glad you are here.</p>',
    })
  })

  it('returns failed with error ref when Resend rejects', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ error: 'Invalid API key' }), { status: 401 })
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail({
      to: 'builder@example.com',
      subject: 'Test',
      text: 'Test body',
    })

    expect(result.delivered).toBe(false)
    if (!result.delivered) {
      expect(result.reason).toBe('failed')
      expect(result.ref).toMatch(/^err_[0-9a-f]{12}$/)
    }
  })

  it('returns failed when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('Network error')
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendEmail({
      to: 'builder@example.com',
      subject: 'Test',
      text: 'Test body',
    })

    expect(result.delivered).toBe(false)
    if (!result.delivered) {
      expect(result.reason).toBe('failed')
      expect(result.ref).toMatch(/^err_[0-9a-f]{12}$/)
    }
  })
})

describe('maskAddress', () => {
  it('masks the user part while keeping domain visible', () => {
    expect(maskAddress('billy@proedu.me')).toBe('bi***@proedu.me')
    expect(maskAddress('a@example.com')).toBe('a*@example.com')
    expect(maskAddress('test.user@example.com')).toBe('te*******@example.com')
  })
})
