// Deriving a rate-limit bucket key from an untrusted request.
//
// Two ways to get this wrong, both of which hand an attacker an unlimited
// number of buckets:
//
// 1. Trusting the whole `X-Forwarded-For` chain. Any client can send
//    `X-Forwarded-For: 1.2.3.4` and the proxy in front of us appends the real
//    peer address to whatever arrived. So the only entry that was not written
//    by the caller is the LAST one, the hop our own trusted proxy added. That
//    is exactly one hop of trust, matching Express's `trust proxy: 1` and Cloud
//    Run's single-front-end topology. Reading the first entry, which is the
//    common shortcut, reads a value the caller chose.
//
// 2. Keying an IPv6 address at full /128 precision. A residential IPv6
//    allocation is a /64 or shorter, so one machine can source traffic from
//    18 quintillion distinct addresses and get a fresh bucket for every
//    request. Truncating to the /64 prefix puts the whole allocation in one
//    bucket.
//
// Pure functions, no I/O, so the security properties are unit-testable.

const XFF_HEADER = 'x-forwarded-for'

/**
 * Optional single fallback header, named by `INTAKE_TRUSTED_IP_HEADER`, used
 * only when `X-Forwarded-For` is absent.
 *
 * Unset by default and deliberately not a guess-list of provider headers.
 * `cf-connecting-ip` and friends are only trustworthy behind that specific
 * provider; anywhere else they are plain client-settable text, so probing for
 * them would let a caller mint a fresh rate-limit bucket per request simply by
 * varying a header. Naming the header is an operator statement about the
 * deployment, which is the only thing that makes it trustworthy.
 */

/**
 * The number of trailing `X-Forwarded-For` entries written by infrastructure we
 * control. Everything to the left of that is caller-supplied text.
 */
const TRUSTED_PROXY_HOPS = 1

/** Bucket key used when no address can be established at all. */
export const UNKNOWN_IP_BUCKET = 'unknown'

/**
 * Take exactly `TRUSTED_PROXY_HOPS` hops off the right-hand end of the chain.
 * Returns null when the header is absent or contains nothing usable.
 */
export function trustedForwardedHop(headerValue: string | null): string | null {
  if (headerValue === null) return null
  const parts = headerValue
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length === 0) return null
  // Indexed access is `T | undefined` under noUncheckedIndexedAccess.
  const candidate = parts[Math.max(parts.length - TRUSTED_PROXY_HOPS, 0)]
  return candidate ?? null
}

/** Strip a `[v6]:port` or `v4:port` wrapper that some proxies emit. */
function stripPort(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('[')) {
    const close = value.indexOf(']')
    if (close > 0) return value.slice(1, close)
    return value.slice(1)
  }
  // Only strip a port from IPv4: a bare IPv6 address is full of colons.
  const firstColon = value.indexOf(':')
  if (firstColon >= 0 && value.indexOf(':', firstColon + 1) === -1) {
    return value.slice(0, firstColon)
  }
  return value
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function isIpv4(value: string): boolean {
  const match = IPV4_PATTERN.exec(value)
  if (!match) return false
  for (let i = 1; i <= 4; i += 1) {
    const octet = match[i]
    if (octet === undefined) return false
    const n = Number(octet)
    if (!Number.isInteger(n) || n < 0 || n > 255) return false
  }
  return true
}

/**
 * Expand an IPv6 address to its eight 16-bit groups. Returns null for anything
 * that is not a well-formed address, including IPv4-mapped forms, which the
 * caller handles separately.
 */
export function expandIpv6(input: string): number[] | null {
  const value = input.toLowerCase().split('%')[0] ?? ''
  if (value.length === 0 || !value.includes(':')) return null
  if (value.split('::').length > 2) return null

  const [headRaw = '', tailRaw = ''] = value.includes('::')
    ? (value.split('::') as [string, string])
    : [value, '']
  const hasDoubleColon = value.includes('::')

  const parseGroups = (segment: string): number[] | null => {
    if (segment.length === 0) return []
    const out: number[] = []
    for (const piece of segment.split(':')) {
      if (piece.length === 0) return null
      if (piece.includes('.')) {
        // Trailing dotted-quad form: ::ffff:192.0.2.1
        if (!isIpv4(piece)) return null
        const octets = piece.split('.').map((o) => Number(o))
        const a = octets[0] ?? 0
        const b = octets[1] ?? 0
        const c = octets[2] ?? 0
        const d = octets[3] ?? 0
        out.push((a << 8) | b, (c << 8) | d)
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(piece)) return null
      out.push(Number.parseInt(piece, 16))
    }
    return out
  }

  const head = parseGroups(headRaw)
  const tail = parseGroups(tailRaw)
  if (head === null || tail === null) return null

  if (!hasDoubleColon) {
    return head.length === 8 ? head : null
  }
  const fill = 8 - head.length - tail.length
  if (fill < 1) return null
  return [...head, ...new Array<number>(fill).fill(0), ...tail]
}

function hex(group: number): string {
  return group.toString(16)
}

/**
 * Reduce an address to the key its bucket is counted under.
 *
 * IPv4 keys on the exact address. IPv6 keys on the /64 routing prefix, so every
 * address a single allocation can mint collapses into one bucket. An
 * IPv4-mapped IPv6 address (`::ffff:203.0.113.9`) is unwrapped to its IPv4 form
 * first, so the same client is not counted in two different buckets depending
 * on which socket family the proxy used.
 */
export function normalizeIpBucket(rawAddress: string | null): string {
  if (rawAddress === null) return UNKNOWN_IP_BUCKET
  const value = stripPort(rawAddress).trim().toLowerCase()
  if (value.length === 0) return UNKNOWN_IP_BUCKET

  if (isIpv4(value)) return `v4:${value}`

  const groups = expandIpv6(value)
  if (groups === null || groups.length !== 8) return UNKNOWN_IP_BUCKET

  // ::ffff:a.b.c.d and ::a.b.c.d are the same host as the bare IPv4 address.
  const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  if (isMapped) {
    const g6 = groups[6] ?? 0
    const g7 = groups[7] ?? 0
    return `v4:${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`
  }

  const prefix = groups.slice(0, 4).map(hex).join(':')
  return `v6:${prefix}::/64`
}

export interface HeaderSource {
  get(name: string): string | null
}

/**
 * The full derivation, from request headers to bucket key.
 *
 * `socketAddress` is the peer address when the runtime exposes one. It is used
 * only as a fallback: when a trusted proxy is in front of us the forwarded hop
 * is the real client and the socket is the proxy.
 */
export function clientIpBucket(
  headers: HeaderSource,
  socketAddress: string | null = null,
): string {
  const forwarded = trustedForwardedHop(headers.get(XFF_HEADER))
  if (forwarded !== null) return normalizeIpBucket(forwarded)

  const trustedHeader = process.env.INTAKE_TRUSTED_IP_HEADER?.trim().toLowerCase()
  if (trustedHeader) {
    const value = headers.get(trustedHeader)
    if (value !== null && value.trim().length > 0) return normalizeIpBucket(value)
  }

  return normalizeIpBucket(socketAddress)
}
