// The rate limiter is only as good as the key it counts on. These are the two
// ways to hand an attacker unlimited buckets, tested directly.

import { afterEach, describe, expect, it } from 'vitest'

import {
  UNKNOWN_IP_BUCKET,
  clientIpBucket,
  expandIpv6,
  normalizeIpBucket,
  trustedForwardedHop,
} from '@/modules/imports/intake/client-ip'

function headersOf(entries: Record<string, string>): Headers {
  return new Headers(entries)
}

describe('trustedForwardedHop', () => {
  it('reads exactly one hop: the entry our own proxy appended', () => {
    expect(trustedForwardedHop('203.0.113.7')).toBe('203.0.113.7')
    expect(trustedForwardedHop('198.51.100.1, 203.0.113.7')).toBe('203.0.113.7')
  })

  it('ignores everything the caller wrote to the left of that hop', () => {
    // The caller sent `X-Forwarded-For: 9.9.9.9`; the proxy appended the peer.
    expect(trustedForwardedHop('9.9.9.9, 203.0.113.7')).toBe('203.0.113.7')
    expect(trustedForwardedHop('9.9.9.9, 8.8.8.8, 1.1.1.1, 203.0.113.7')).toBe('203.0.113.7')
  })

  it('tolerates whitespace and empty entries', () => {
    expect(trustedForwardedHop('  9.9.9.9 ,  , 203.0.113.7  ')).toBe('203.0.113.7')
  })

  it('returns null for an absent or empty header', () => {
    expect(trustedForwardedHop(null)).toBeNull()
    expect(trustedForwardedHop('')).toBeNull()
    expect(trustedForwardedHop('  ,  ,  ')).toBeNull()
  })
})

describe('expandIpv6', () => {
  it('expands compressed forms to eight groups', () => {
    expect(expandIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(expandIpv6('2001:db8::1')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1])
    expect(expandIpv6('2001:db8:0:0:0:0:0:1')).toEqual([0x2001, 0x0db8, 0, 0, 0, 0, 0, 1])
  })

  it('rejects malformed input', () => {
    expect(expandIpv6('2001:db8::1::2')).toBeNull()
    expect(expandIpv6('not-an-address')).toBeNull()
    expect(expandIpv6('2001:db8:0:0:0:0:0')).toBeNull()
    expect(expandIpv6('zzzz::1')).toBeNull()
  })
})

describe('normalizeIpBucket', () => {
  it('keys IPv4 on the exact address', () => {
    expect(normalizeIpBucket('203.0.113.7')).toBe('v4:203.0.113.7')
    expect(normalizeIpBucket('203.0.113.7:51234')).toBe('v4:203.0.113.7')
  })

  it('collapses every address in one IPv6 /64 into a single bucket', () => {
    // A residential allocation is a /64 or shorter. Without truncation a single
    // machine can mint 2^64 distinct keys and never hit a ceiling.
    const a = normalizeIpBucket('2001:db8:abcd:1234::1')
    const b = normalizeIpBucket('2001:db8:abcd:1234:ffff:ffff:ffff:ffff')
    const c = normalizeIpBucket('2001:db8:abcd:1234:0:0:0:beef')
    expect(a).toBe('v6:2001:db8:abcd:1234::/64')
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('keeps different /64 prefixes in different buckets', () => {
    expect(normalizeIpBucket('2001:db8:abcd:1234::1')).not.toBe(
      normalizeIpBucket('2001:db8:abcd:1235::1'),
    )
  })

  it('unwraps IPv4-mapped IPv6 so one client is not counted twice', () => {
    expect(normalizeIpBucket('::ffff:203.0.113.7')).toBe('v4:203.0.113.7')
    expect(normalizeIpBucket('[::ffff:203.0.113.7]:443')).toBe('v4:203.0.113.7')
  })

  it('strips a bracketed port and a zone id', () => {
    expect(normalizeIpBucket('[2001:db8:abcd:1234::1]:8443')).toBe('v6:2001:db8:abcd:1234::/64')
    expect(normalizeIpBucket('fe80:0:0:1::1%eth0')).toBe('v6:fe80:0:0:1::/64')
  })

  it('falls back to a single shared bucket rather than trusting garbage', () => {
    expect(normalizeIpBucket(null)).toBe(UNKNOWN_IP_BUCKET)
    expect(normalizeIpBucket('')).toBe(UNKNOWN_IP_BUCKET)
    expect(normalizeIpBucket('definitely not an ip')).toBe(UNKNOWN_IP_BUCKET)
  })
})

describe('clientIpBucket', () => {
  it('cannot be moved by a forged multi-hop X-Forwarded-For', () => {
    const real = clientIpBucket(headersOf({ 'x-forwarded-for': '203.0.113.7' }))
    const forgedOne = clientIpBucket(
      headersOf({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' }),
    )
    const forgedMany = clientIpBucket(
      headersOf({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3, 203.0.113.7' }),
    )
    expect(forgedOne).toBe(real)
    expect(forgedMany).toBe(real)
  })

  it('cannot be moved by forging IPv6 hops either', () => {
    const base = clientIpBucket(headersOf({ 'x-forwarded-for': '2001:db8:abcd:1234::9' }))
    const forged = clientIpBucket(
      headersOf({
        'x-forwarded-for': '2001:db8:ffff:ffff::1, 2001:db8:0:0::5, 2001:db8:abcd:1234::9',
      }),
    )
    expect(forged).toBe(base)
    expect(forged).toBe('v6:2001:db8:abcd:1234::/64')
  })

  it('ignores a spoofed X-Real-IP whenever a forwarded chain is present', () => {
    const bucket = clientIpBucket(
      headersOf({ 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '9.9.9.9' }),
    )
    expect(bucket).toBe('v4:203.0.113.7')
  })

  it('falls back to the socket address when no proxy header is present', () => {
    expect(clientIpBucket(headersOf({}), '198.51.100.4')).toBe('v4:198.51.100.4')
    expect(clientIpBucket(headersOf({}), null)).toBe(UNKNOWN_IP_BUCKET)
  })
})

// A fallback IP header is only trustworthy when an operator names it for the
// deployment. Probing a guess-list of provider headers would mean that on any
// host not setting X-Forwarded-For, a caller mints a fresh rate-limit bucket
// per request by varying a header they control.
describe('fallback IP header is opt-in', () => {
  const original = process.env.INTAKE_TRUSTED_IP_HEADER

  afterEach(() => {
    if (original === undefined) delete process.env.INTAKE_TRUSTED_IP_HEADER
    else process.env.INTAKE_TRUSTED_IP_HEADER = original
  })

  it('ignores provider headers when none is configured', () => {
    delete process.env.INTAKE_TRUSTED_IP_HEADER
    const bucket = clientIpBucket(
      headersOf({ 'cf-connecting-ip': '9.9.9.9', 'x-real-ip': '8.8.8.8' }),
      '203.0.113.5',
    )
    expect(bucket).toBe(normalizeIpBucket('203.0.113.5'))
  })

  it('gives two forged header values the same bucket, not two', () => {
    delete process.env.INTAKE_TRUSTED_IP_HEADER
    const a = clientIpBucket(headersOf({ 'cf-connecting-ip': '1.1.1.1' }), '203.0.113.5')
    const b = clientIpBucket(headersOf({ 'cf-connecting-ip': '2.2.2.2' }), '203.0.113.5')
    expect(a).toBe(b)
  })

  it('uses the header once an operator names it', () => {
    process.env.INTAKE_TRUSTED_IP_HEADER = 'cf-connecting-ip'
    const bucket = clientIpBucket(headersOf({ 'cf-connecting-ip': '9.9.9.9' }), '203.0.113.5')
    expect(bucket).toBe(normalizeIpBucket('9.9.9.9'))
  })

  it('still prefers the trusted forwarded hop over the named header', () => {
    process.env.INTAKE_TRUSTED_IP_HEADER = 'cf-connecting-ip'
    const bucket = clientIpBucket(
      headersOf({ 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '9.9.9.9' }),
      null,
    )
    expect(bucket).toBe(normalizeIpBucket('203.0.113.7'))
  })
})
