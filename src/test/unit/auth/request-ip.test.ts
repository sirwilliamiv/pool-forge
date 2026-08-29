// The limiter is only as good as the key it counts on. These are the two ways to
// hand an attacker unlimited login buckets, tested against the auth derivation
// rather than assumed from the intake one.

import { describe, expect, it } from 'vitest'

import { UNKNOWN_IP_BUCKET, authClientIpBucket } from '@/modules/auth/request-ip'

function headersOf(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

describe('authClientIpBucket', () => {
  it('reads the hop our own proxy appended, not the one the caller wrote', () => {
    const real = authClientIpBucket(headersOf({ 'x-forwarded-for': '203.0.113.7' }))
    expect(real).toBe('v4:203.0.113.7')
    expect(authClientIpBucket(headersOf({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }))).toBe(real)
    expect(
      authClientIpBucket(headersOf({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 203.0.113.7' })),
    ).toBe(real)
  })

  it('collapses an entire IPv6 /64 into one bucket', () => {
    // Everything below differs only in the host half of the address. A single
    // machine on one residential allocation can source all of them, so counting
    // them separately would mean 2^64 attempts at the tightest ceiling.
    const base = authClientIpBucket(headersOf({ 'x-forwarded-for': '2001:db8:abcd:1234::1' }))
    const sameAllocation = [
      '2001:db8:abcd:1234::2',
      '2001:db8:abcd:1234:ffff:ffff:ffff:ffff',
      '2001:db8:abcd:1234:0:0:0:beef',
      '2001:db8:abcd:1234:dead:beef:cafe:1',
      '[2001:db8:abcd:1234::9]:44321',
    ]
    expect(base).toBe('v6:2001:db8:abcd:1234::/64')
    for (const address of sameAllocation) {
      expect(authClientIpBucket(headersOf({ 'x-forwarded-for': address }))).toBe(base)
    }
  })

  it('keeps a genuinely different allocation in a different bucket', () => {
    const a = authClientIpBucket(headersOf({ 'x-forwarded-for': '2001:db8:abcd:1234::1' }))
    const b = authClientIpBucket(headersOf({ 'x-forwarded-for': '2001:db8:abcd:1235::1' }))
    expect(a).not.toBe(b)
  })

  it('counts one client once whether the proxy handed us v4 or v4-mapped v6', () => {
    expect(authClientIpBucket(headersOf({ 'x-forwarded-for': '::ffff:203.0.113.7' }))).toBe(
      'v4:203.0.113.7',
    )
  })

  it('ignores a header the operator has not named', () => {
    // `cf-connecting-ip` and friends are trustworthy behind one provider and are
    // plain client-settable text everywhere else. Probing for them would let any
    // caller mint a fresh bucket per request.
    delete process.env.AUTH_TRUSTED_IP_HEADER
    expect(authClientIpBucket(headersOf({ 'cf-connecting-ip': '198.51.100.4' }))).toBe(
      UNKNOWN_IP_BUCKET,
    )
  })

  it('uses the header the operator did name, only when no chain is present', () => {
    process.env.AUTH_TRUSTED_IP_HEADER = 'x-real-ip'
    try {
      expect(authClientIpBucket(headersOf({ 'x-real-ip': '198.51.100.4' }))).toBe('v4:198.51.100.4')
      expect(
        authClientIpBucket(headersOf({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '203.0.113.7' })),
      ).toBe('v4:203.0.113.7')
    } finally {
      delete process.env.AUTH_TRUSTED_IP_HEADER
    }
  })

  it('falls back to the socket peer, then to one shared bucket', () => {
    expect(authClientIpBucket(headersOf({}), '203.0.113.9')).toBe('v4:203.0.113.9')
    expect(authClientIpBucket(headersOf({}), null)).toBe(UNKNOWN_IP_BUCKET)
    expect(authClientIpBucket(headersOf({ 'x-forwarded-for': 'not an address' }))).toBe(
      UNKNOWN_IP_BUCKET,
    )
  })
})
