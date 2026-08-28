// An in-memory stand-in for Google Identity Platform.
//
// The suite runs constantly and several tracks depend on it, so it must never
// need a network or a credential to pass. This is the boundary that makes that
// possible: `setIdentityClient` swaps it in, the code under test cannot tell the
// difference, and no packet leaves the process.
//
// It is deliberately NOT a mock that records calls and asserts on them. It is a
// small working directory, so a test can say "this address now exists with this
// password" and the code under test finds out the same way it would in
// production. The behaviours it copies are the ones observed against the live
// service: a wrong password and an unknown address are the same refusal, and
// creating an address twice is `email-exists`.

import type { IdentityClient, IdentityResult } from '@/modules/auth/identity'

export interface FakeIdentity extends IdentityClient {
  /** email (lower case) to uid and password. */
  readonly accounts: Map<string, { uid: string; password: string }>
  /** Every address a reset was requested for, in order. */
  readonly resets: string[]
  /** Force the next call of each kind to fail this way. */
  failNext: {
    verify?: IdentityResult<{ uid: string }>
    create?: IdentityResult<{ uid: string }>
    reset?: IdentityResult<null>
  }
  seed(email: string, password: string, uid?: string): string
}

const INVALID = { ok: false, failure: 'invalid-credentials' } as const
const EXISTS = { ok: false, failure: 'email-exists' } as const

export function fakeIdentity(options: { configured?: boolean } = {}): FakeIdentity {
  const configured = options.configured ?? true
  const accounts = new Map<string, { uid: string; password: string }>()
  const resets: string[] = []
  let counter = 0

  const client: FakeIdentity = {
    accounts,
    resets,
    failNext: {},

    seed(email, password, uid) {
      counter += 1
      const id = uid ?? `fake-uid-${counter}`
      accounts.set(email.toLowerCase(), { uid: id, password })
      return id
    },

    configured() {
      return configured
    },

    async verifyPassword(email, password) {
      const forced = client.failNext.verify
      if (forced) {
        client.failNext.verify = undefined as never
        return forced
      }
      if (!configured) return { ok: false, failure: 'not-configured' }
      const account = accounts.get(email.toLowerCase())
      // One refusal for both cases, exactly as the live service answers with
      // email-enumeration protection on.
      if (!account || account.password !== password) return INVALID
      return { ok: true, data: { uid: account.uid } }
    },

    async createUser(email, password) {
      const forced = client.failNext.create
      if (forced) {
        client.failNext.create = undefined as never
        return forced
      }
      if (!configured) return { ok: false, failure: 'not-configured' }
      const key = email.toLowerCase()
      if (accounts.has(key)) return EXISTS
      counter += 1
      const uid = `fake-uid-${counter}`
      accounts.set(key, { uid, password })
      return { ok: true, data: { uid } }
    },

    async sendPasswordReset(email) {
      const forced = client.failNext.reset
      if (forced) {
        client.failNext.reset = undefined as never
        return forced
      }
      if (!configured) return { ok: false, failure: 'not-configured' }
      // The live service answers 200 for an address it has never seen. Copied on
      // purpose: a fake that refused unknown addresses would let a caller that
      // leaks existence pass its tests.
      resets.push(email.toLowerCase())
      return { ok: true, data: null }
    },
  }

  return client
}
