// The bundle contract's schemas are the arbiter, so what they accept and
// refuse is pinned here: valid payloads pass, each class of invalid payload
// fails, and every rejection code maps to the status the phone's retry logic
// keys on.

import { describe, expect, it } from 'vitest'

import {
  BUNDLE_CONTRACT_VERSION,
  BundleRejection,
  MAX_CHUNK_BYTES,
  MAX_CHUNKS_PER_SESSION,
  chunkRegisterSchema,
  finalizeSchema,
  seqParamSchema,
  sessionCreateSchema,
  sessionIdSchema,
  captureTokenSchema,
  statusForBundleRejection,
} from '@/modules/capture-bundle/contract'

const SESSION_ID = `bcs_${'a'.repeat(32)}`

function sessionCreate(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: BUNDLE_CONTRACT_VERSION,
    sessionId: SESSION_ID,
    address: '123 Main St, Prosper, TX',
    lat: 33.23,
    lng: -96.8,
    device: { model: 'iPhone14,4', osVersion: '17.5', appVersion: '0.1.0', hasLidar: false },
    ...overrides,
  }
}

describe('session ids and tokens', () => {
  it('accepts bcs_ followed by 32 hex', () => {
    expect(sessionIdSchema.safeParse(SESSION_ID).success).toBe(true)
  })

  it.each([
    ['wrong prefix', `cap_${'a'.repeat(32)}`],
    ['too short', `bcs_${'a'.repeat(31)}`],
    ['too long', `bcs_${'a'.repeat(33)}`],
    ['uppercase hex', `bcs_${'A'.repeat(32)}`],
    ['not hex', `bcs_${'g'.repeat(32)}`],
  ])('refuses a session id with %s', (_name, value) => {
    expect(sessionIdSchema.safeParse(value).success).toBe(false)
  })

  it('accepts pfc_ followed by 40 hex and nothing else', () => {
    expect(captureTokenSchema.safeParse(`pfc_${'0'.repeat(40)}`).success).toBe(true)
    expect(captureTokenSchema.safeParse(`pfc_${'0'.repeat(39)}`).success).toBe(false)
    expect(captureTokenSchema.safeParse(`pfx_${'0'.repeat(40)}`).success).toBe(false)
  })
})

describe('session create', () => {
  it('accepts a minimal payload', () => {
    expect(sessionCreateSchema.safeParse(sessionCreate()).success).toBe(true)
  })

  it('accepts an optional placeId and footprint', () => {
    const parsed = sessionCreateSchema.safeParse(
      sessionCreate({
        placeId: 'ChIJexample',
        footprint: [
          [33.1, -96.8],
          [33.1, -96.79],
          [33.11, -96.79],
        ],
      }),
    )
    expect(parsed.success).toBe(true)
  })

  it('refuses an unknown contract version', () => {
    expect(sessionCreateSchema.safeParse(sessionCreate({ contractVersion: 2 })).success).toBe(false)
  })

  it('refuses a two-point footprint', () => {
    const parsed = sessionCreateSchema.safeParse(
      sessionCreate({ footprint: [[33.1, -96.8], [33.1, -96.79]] }),
    )
    expect(parsed.success).toBe(false)
  })

  it('refuses coordinates off the planet', () => {
    expect(sessionCreateSchema.safeParse(sessionCreate({ lat: 91 })).success).toBe(false)
    expect(sessionCreateSchema.safeParse(sessionCreate({ lng: -181 })).success).toBe(false)
  })

  it('refuses a device with missing fields', () => {
    const parsed = sessionCreateSchema.safeParse(
      sessionCreate({ device: { model: 'iPhone14,4', osVersion: '17.5', appVersion: '0.1.0' } }),
    )
    expect(parsed.success).toBe(false)
  })
})

describe('chunk register', () => {
  const chunk = { seq: 3, kind: 'frames', bytes: 1024, sha256: 'ab'.repeat(32) }

  it('accepts a well-formed registration', () => {
    expect(chunkRegisterSchema.safeParse(chunk).success).toBe(true)
  })

  it('refuses a declared size over the cap', () => {
    expect(chunkRegisterSchema.safeParse({ ...chunk, bytes: MAX_CHUNK_BYTES + 1 }).success).toBe(false)
  })

  it('refuses zero and negative sizes', () => {
    expect(chunkRegisterSchema.safeParse({ ...chunk, bytes: 0 }).success).toBe(false)
    expect(chunkRegisterSchema.safeParse({ ...chunk, bytes: -5 }).success).toBe(false)
  })

  it('refuses a seq beyond the per-session cap', () => {
    expect(chunkRegisterSchema.safeParse({ ...chunk, seq: MAX_CHUNKS_PER_SESSION }).success).toBe(false)
  })

  it('refuses an unknown kind and a malformed hash', () => {
    expect(chunkRegisterSchema.safeParse({ ...chunk, kind: 'video' }).success).toBe(false)
    expect(chunkRegisterSchema.safeParse({ ...chunk, sha256: 'AB'.repeat(32) }).success).toBe(false)
    expect(chunkRegisterSchema.safeParse({ ...chunk, sha256: 'ab'.repeat(31) }).success).toBe(false)
  })
})

describe('finalize and the seq param', () => {
  it('accepts a manifest declaration', () => {
    expect(finalizeSchema.safeParse({ contractVersion: 1, maxSeq: 41 }).success).toBe(true)
  })

  it('refuses a negative or fractional maxSeq', () => {
    expect(finalizeSchema.safeParse({ contractVersion: 1, maxSeq: -1 }).success).toBe(false)
    expect(finalizeSchema.safeParse({ contractVersion: 1, maxSeq: 1.5 }).success).toBe(false)
  })

  it('coerces the path seq from its string form and bounds it', () => {
    expect(seqParamSchema.safeParse('12')).toMatchObject({ success: true, data: 12 })
    expect(seqParamSchema.safeParse('-1').success).toBe(false)
    expect(seqParamSchema.safeParse('twelve').success).toBe(false)
  })
})

describe('rejection statuses', () => {
  it.each([
    ['UNAUTHORIZED', 401],
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['MALFORMED', 400],
    ['UNSUPPORTED_VERSION', 409],
    ['CONFLICT', 409],
    ['INCOMPLETE', 409],
    ['TOO_LARGE', 413],
    ['NOT_CONFIGURED', 503],
  ] as const)('%s maps to %d', (code, status) => {
    expect(statusForBundleRejection(code)).toBe(status)
  })

  it('carries a sentence and optional detail', () => {
    const rejection = new BundleRejection('INCOMPLETE', 'Missing chunks.', { missingSeqs: [1, 2] })
    expect(rejection.message).toBe('Missing chunks.')
    expect(rejection.detail).toEqual({ missingSeqs: [1, 2] })
    expect(rejection.name).toBe('BundleRejection')
  })
})
