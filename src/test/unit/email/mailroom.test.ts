import { afterEach, describe, expect, it, vi } from 'vitest'

import { MAILROOM_EVENTS, MAILROOM_LISTS, mailroom, resetMailroom, syncContact } from '@/modules/email/mailroom'

describe('mailroom sync', () => {
  afterEach(() => {
    delete process.env.MAILROOM_URL
    delete process.env.MAILROOM_API_KEY
    resetMailroom()
    vi.unstubAllGlobals()
  })

  it('is off when the env vars are missing and never touches fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    resetMailroom()
    expect(mailroom()).toBeNull()
    await syncContact({ email: 'a@b.test' }, { email: 'a@b.test', name: MAILROOM_EVENTS.WAITLIST_JOINED })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('upserts the contact into the waitlist list and tracks the event when configured', async () => {
    process.env.MAILROOM_URL = 'https://mailroom.test'
    process.env.MAILROOM_API_KEY = 'mr_test_key'
    resetMailroom()
    const calls: { url: string; body: unknown; auth: string }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).authorization ?? '' })
      return new Response(JSON.stringify({ created: 1, updated: 0, contacts: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }))
    await syncContact({ email: 'a@b.test', firstName: 'Ada', lists: [MAILROOM_LISTS.WAITLIST] }, { email: 'a@b.test', name: MAILROOM_EVENTS.WAITLIST_JOINED })
    expect(calls.map((c) => c.url)).toEqual(['https://mailroom.test/v1/contacts/upsert', 'https://mailroom.test/v1/events'])
    expect(calls[0]!.auth).toBe('Bearer mr_test_key')
    expect(calls[0]!.body).toEqual({ contacts: [{ email: 'a@b.test', firstName: 'Ada', lists: ['waitlist'] }] })
  })

  it('swallows a failing sync so the signup outcome is unchanged', async () => {
    process.env.MAILROOM_URL = 'https://mailroom.test'
    process.env.MAILROOM_API_KEY = 'mr_test_key'
    resetMailroom()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"code":"internal","message":"x"}}', { status: 500 })))
    await expect(syncContact({ email: 'a@b.test' })).resolves.toBeUndefined()
  })
})
