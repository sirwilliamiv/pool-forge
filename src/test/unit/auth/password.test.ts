// @vitest-environment node
//
// Rate limiting stops guessing. It does not stop the other question an attacker
// wants answered, which is which of a list of addresses have accounts here, and
// an early return for an unknown address answers it with a stopwatch.

import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { primeUnknownUserHash, verifyCredentialPassword } from '@/modules/auth/password'

// The decoy hash is computed once per process. Warmed here so the assertions
// below measure the comparison, not a one-off key derivation.
primeUnknownUserHash()

describe('verifyCredentialPassword', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await bcrypt.hash('correct horse', 12)
    expect(await verifyCredentialPassword(hash, 'correct horse')).toBe(true)
    expect(await verifyCredentialPassword(hash, 'wrong horse')).toBe(false)
  })

  it('rejects an address with no account', async () => {
    expect(await verifyCredentialPassword(null, 'anything at all')).toBe(false)
  })

  it('still runs a full hash comparison when there is no account', async () => {
    // The property, stated as behaviour rather than as a timing measurement:
    // an unknown address must reach bcrypt exactly as a known one does. Skipping
    // it is what makes the two paths distinguishable from outside.
    const spy = vi.spyOn(bcrypt, 'compare')
    await verifyCredentialPassword(null, 'anything at all')
    expect(spy).toHaveBeenCalledTimes(1)

    spy.mockClear()
    const hash = await bcrypt.hash('secret', 12)
    await verifyCredentialPassword(hash, 'secret')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('spends comparable wall-clock time on both paths', async () => {
    const hash = await bcrypt.hash('secret', 12)

    const knownStart = performance.now()
    await verifyCredentialPassword(hash, 'wrong')
    const known = performance.now() - knownStart

    const unknownStart = performance.now()
    await verifyCredentialPassword(null, 'wrong')
    const unknown = performance.now() - unknownStart

    // Generous, because a shared CI box is noisy and this must not be a flaky
    // test. It still fails by an enormous margin if the unknown path returns
    // without hashing: that path is microseconds against hundreds of
    // milliseconds, which is three orders of magnitude, not a factor of five.
    expect(unknown).toBeGreaterThan(known / 5)
  })
})
