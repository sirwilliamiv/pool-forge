// @vitest-environment node
//
// The HTTP client for Google Identity Platform, with `fetch` replaced.
//
// No network. The live service is proved by an end-to-end run, not by this
// suite: a test that reached out to Google would make the whole gate depend on
// somebody's credentials and somebody's connection, and three other tracks run
// this suite constantly.
//
// What is worth testing here is the translation layer, because that is where a
// mistake is invisible in production: a provider sentence reaching a screen, an
// unknown refusal being read as a wrong password, or a 500 being reported as
// "your password is wrong" and sending a real user to reset a password that was
// never broken.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { httpIdentityClient, identityConfig } from '@/modules/auth/identity'

const KEY = 'test-api-key'

let calls: Array<{ url: string; body: Record<string, unknown> }> = []

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch(handler: (url: string, body: Record<string, unknown>) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      calls.push({ url, body })
      return handler(url, body)
    }),
  )
}

beforeEach(() => {
  calls = []
  vi.stubEnv('IDENTITY_PLATFORM_API_KEY', KEY)
  vi.stubEnv('IDENTITY_PLATFORM_TENANT_ID', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('identityConfig', () => {
  it('is null with no API key, so the app boots without one', () => {
    expect(identityConfig({})).toBeNull()
  })

  it('treats whitespace as unset', () => {
    expect(identityConfig({ IDENTITY_PLATFORM_API_KEY: '   ' })).toBeNull()
  })

  it('points at the live Identity Toolkit host', () => {
    const config = identityConfig({ IDENTITY_PLATFORM_API_KEY: KEY })
    expect(config?.baseUrl).toBe('https://identitytoolkit.googleapis.com/v1')
    expect(config?.apiKey).toBe(KEY)
  })

  it('carries a tenant only when one is named', () => {
    expect(identityConfig({ IDENTITY_PLATFORM_API_KEY: KEY })?.tenantId).toBeNull()
    expect(
      identityConfig({ IDENTITY_PLATFORM_API_KEY: KEY, IDENTITY_PLATFORM_TENANT_ID: 't1' })
        ?.tenantId,
    ).toBe('t1')
  })
})

describe('verifyPassword', () => {
  it('returns the uid on success and asks for no session tokens', async () => {
    stubFetch(() => respond(200, { localId: 'uid-123', idToken: 'should-be-ignored' }))
    const result = await httpIdentityClient.verifyPassword('sam@example.com', 'hunter22')
    expect(result).toEqual({ ok: true, data: { uid: 'uid-123' } })
    expect(calls[0]?.url).toContain('accounts:signInWithPassword')
    // NextAuth is the session layer. Asking for Identity Platform's tokens would
    // be a second set of session credentials to store, expire and leak.
    expect(calls[0]?.body.returnSecureToken).toBe(false)
  })

  it('reads a wrong password and an unknown address as the same refusal', async () => {
    // This is what the live service does with email-enumeration protection on,
    // and this code must not undo it by inferring existence from a refusal.
    stubFetch(() => respond(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } }))
    const wrong = await httpIdentityClient.verifyPassword('sam@example.com', 'nope')

    stubFetch(() => respond(400, { error: { message: 'EMAIL_NOT_FOUND' } }))
    const unknown = await httpIdentityClient.verifyPassword('nobody@example.com', 'nope')

    expect(wrong).toEqual({ ok: false, failure: 'invalid-credentials' })
    expect(unknown).toEqual(wrong)
  })

  it('never lets the provider’s own words out', async () => {
    stubFetch(() =>
      respond(403, {
        error: {
          message: 'API key not valid. Please pass a valid API key. key=AIzaSyLEAKED',
        },
      }),
    )
    const result = await httpIdentityClient.verifyPassword('sam@example.com', 'hunter22')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.failure).toBe('unavailable')
    // The whole point: a key fragment in a provider message must not travel.
    expect(JSON.stringify(result)).not.toContain('AIzaSy')
    expect(result.ref).toMatch(/^err_[0-9a-f]{12}$/)
  })

  it('reports an unreachable service as unavailable, not as a bad password', async () => {
    // Getting this wrong tells a builder their password is wrong during an
    // outage, and they reset a password that was never broken.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED 142.250.0.1:443')
      }),
    )
    const result = await httpIdentityClient.verifyPassword('sam@example.com', 'hunter22')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.failure).toBe('unavailable')
  })

  it('gives up rather than holding a sign-in open forever', async () => {
    stubFetch(() => respond(200, { localId: 'uid-123' }))
    await httpIdentityClient.verifyPassword('sam@example.com', 'hunter22')
    const init = vi.mocked(fetch).mock.calls[0]?.[1]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('createUser', () => {
  it('reports a duplicate address distinctly, because acceptance recovers from it', async () => {
    stubFetch(() => respond(400, { error: { message: 'EMAIL_EXISTS' } }))
    const result = await httpIdentityClient.createUser('sam@example.com', 'hunter22')
    expect(result).toEqual({ ok: false, failure: 'email-exists' })
  })

  it('treats a response with no uid as a fault rather than a success', async () => {
    stubFetch(() => respond(200, { kind: 'identitytoolkit#SignupNewUserResponse' }))
    const result = await httpIdentityClient.createUser('sam@example.com', 'hunter22')
    expect(result.ok).toBe(false)
  })
})

describe('sendPasswordReset', () => {
  it('asks for a password-reset code and nothing else', async () => {
    stubFetch(() => respond(200, { email: 'sam@example.com' }))
    const result = await httpIdentityClient.sendPasswordReset('sam@example.com')
    expect(result).toEqual({ ok: true, data: null })
    expect(calls[0]?.url).toContain('accounts:sendOobCode')
    expect(calls[0]?.body.requestType).toBe('PASSWORD_RESET')
    // `returnOobLink` would ask for the link back instead of sending mail, and
    // it needs admin credentials this client does not hold. Its absence is the
    // point: Identity Platform sends the email itself.
    expect(calls[0]?.body.returnOobLink).toBeUndefined()
  })
})

describe('with no API key set', () => {
  it('answers not-configured without touching the network', async () => {
    vi.stubEnv('IDENTITY_PLATFORM_API_KEY', '')
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)

    expect(httpIdentityClient.configured()).toBe(false)
    expect(await httpIdentityClient.verifyPassword('a@b.com', 'x')).toEqual({
      ok: false,
      failure: 'not-configured',
    })
    expect(await httpIdentityClient.createUser('a@b.com', 'x')).toEqual({
      ok: false,
      failure: 'not-configured',
    })
    expect(await httpIdentityClient.sendPasswordReset('a@b.com')).toEqual({
      ok: false,
      failure: 'not-configured',
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
