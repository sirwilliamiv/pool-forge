// The ledger's state machine, against a real libSQL file database in a temp
// directory. Nothing is mocked: the point of a file: fallback is that the
// exact code that runs against Turso runs here, schema creation included.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { BUNDLE_CONTRACT_VERSION, BundleRejection } from '@/modules/capture-bundle/contract'
import { CaptureLedger, type CaptureAuth } from '@/modules/capture-bundle/ledger'
import type { SessionCreate } from '@/modules/capture-bundle/contract'

const dir = mkdtempSync(join(tmpdir(), 'capture-ledger-'))
const ledger = new CaptureLedger(`file:${join(dir, 'ledger.db')}`)

const orgA: CaptureAuth = { orgId: 'org-a', userId: 'user-a' }
const orgB: CaptureAuth = { orgId: 'org-b', userId: 'user-b' }

let sessionCounter = 0
function newSessionId(): string {
  sessionCounter += 1
  return `bcs_${String(sessionCounter).padStart(32, '0')}`
}

function payload(sessionId: string, overrides: Partial<SessionCreate> = {}): SessionCreate {
  const base: SessionCreate = {
    contractVersion: BUNDLE_CONTRACT_VERSION,
    sessionId,
    address: '123 Main St, Prosper, TX',
    lat: 33.23,
    lng: -96.8,
    device: { model: 'iPhone14,4', osVersion: '17.5', appVersion: '0.1.0', hasLidar: false },
  }
  return { ...base, ...overrides }
}

function chunk(seq: number, kind: 'frames' | 'poses' | 'depth' | 'meta', bytes = 1024) {
  return { seq, kind, bytes, sha256: seq.toString(16).padStart(2, '0').repeat(32) }
}

function gcsObject(auth: CaptureAuth, sessionId: string, seq: number, kind: string): string {
  return `captures/${auth.orgId}/${sessionId}/${seq}-${kind}.bin`
}

async function rejectionFrom(promise: Promise<unknown>): Promise<BundleRejection> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(BundleRejection)
    return err as BundleRejection
  }
  throw new Error('expected a BundleRejection and got a result')
}

afterAll(async () => {
  await ledger.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('tokens', () => {
  it('mints a pfc_ token and resolves it back to its org and user', async () => {
    const minted = await ledger.mintToken(orgA, 'test phone')
    expect(minted.token).toMatch(/^pfc_[0-9a-f]{40}$/)
    expect(await ledger.authByToken(minted.token)).toEqual(orgA)
  })

  it('answers null for an unknown or malformed token', async () => {
    expect(await ledger.authByToken(`pfc_${'0'.repeat(40)}`)).toBeNull()
    expect(await ledger.authByToken('not-a-token')).toBeNull()
    expect(await ledger.authByToken('')).toBeNull()
  })
})

describe('session create', () => {
  it('creates, and retries idempotently with the same payload', async () => {
    const id = newSessionId()
    expect(await ledger.createSession(orgA, payload(id))).toEqual({ sessionId: id })
    expect(await ledger.createSession(orgA, payload(id))).toEqual({ sessionId: id })
  })

  it('refuses the same id with a different payload', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    const rejection = await rejectionFrom(
      ledger.createSession(orgA, payload(id, { address: '456 Other Rd' })),
    )
    expect(rejection.code).toBe('CONFLICT')
  })

  it('refuses another org reusing the id, even with an identical payload', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    const rejection = await rejectionFrom(ledger.createSession(orgB, payload(id)))
    expect(rejection.code).toBe('FORBIDDEN')
  })
})

describe('chunk register and verify', () => {
  it('walks the pending -> refreshed -> verified -> conflict lifecycle', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))

    const first = await ledger.registerChunk(orgA, id, chunk(0, 'meta'), gcsObject(orgA, id, 0, 'meta'))
    expect(first.refreshed).toBe(false)

    // Re-register before verification: a retry, answered with a refresh.
    const again = await ledger.registerChunk(orgA, id, chunk(0, 'meta', 2048), gcsObject(orgA, id, 0, 'meta'))
    expect(again.refreshed).toBe(true)
    expect((await ledger.chunkForVerify(orgA, id, 0)).bytes).toBe(2048)

    await ledger.markVerified(orgA, id, 0)
    expect((await ledger.chunkForVerify(orgA, id, 0)).verified).toBe(true)

    // Verification is idempotent: the lost-ack retry must succeed.
    await expect(ledger.markVerified(orgA, id, 0)).resolves.toBeUndefined()

    // Re-register after verification: the bytes are pinned now.
    const rejection = await rejectionFrom(
      ledger.registerChunk(orgA, id, chunk(0, 'meta'), gcsObject(orgA, id, 0, 'meta')),
    )
    expect(rejection.code).toBe('CONFLICT')
  })

  it('pins the meta chunk to seq 0 in both directions', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    expect(
      (await rejectionFrom(ledger.registerChunk(orgA, id, chunk(0, 'frames'), gcsObject(orgA, id, 0, 'frames')))).code,
    ).toBe('MALFORMED')
    expect(
      (await rejectionFrom(ledger.registerChunk(orgA, id, chunk(3, 'meta'), gcsObject(orgA, id, 3, 'meta')))).code,
    ).toBe('MALFORMED')
  })

  it('answers not-found for a chunk nobody registered', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    expect((await rejectionFrom(ledger.markVerified(orgA, id, 7))).code).toBe('NOT_FOUND')
    expect((await rejectionFrom(ledger.chunkForVerify(orgA, id, 7))).code).toBe('NOT_FOUND')
  })
})

describe('finalize', () => {
  async function uploadAll(id: string, seqs: Array<[number, 'frames' | 'poses' | 'meta']>) {
    for (const [seq, kind] of seqs) {
      await ledger.registerChunk(orgA, id, chunk(seq, kind), gcsObject(orgA, id, seq, kind))
      await ledger.markVerified(orgA, id, seq)
    }
  }

  it('lists exactly the missing seqs on an incomplete bundle', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    await uploadAll(id, [[0, 'meta'], [1, 'frames'], [3, 'frames']])
    // Registered but never verified: also missing.
    await ledger.registerChunk(orgA, id, chunk(4, 'poses'), gcsObject(orgA, id, 4, 'poses'))

    const rejection = await rejectionFrom(ledger.finalize(orgA, id, 4))
    expect(rejection.code).toBe('INCOMPLETE')
    expect(rejection.detail).toEqual({ missingSeqs: [2, 4] })
  })

  it('refuses a manifest that undercounts what was uploaded', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    await uploadAll(id, [[0, 'meta'], [1, 'frames'], [2, 'poses']])
    const rejection = await rejectionFrom(ledger.finalize(orgA, id, 1))
    expect(rejection.code).toBe('CONFLICT')
  })

  it('closes a whole bundle, idempotently, and then refuses new chunks', async () => {
    const id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    await uploadAll(id, [[0, 'meta'], [1, 'frames'], [2, 'poses']])

    const result = await ledger.finalize(orgA, id, 2)
    expect(result).toMatchObject({ sessionId: id, chunkCount: 3 })

    // The lost-response retry answers ok with the original timestamp.
    const retry = await ledger.finalize(orgA, id, 2)
    expect(retry.finalizedAt).toBe(result.finalizedAt)

    const rejection = await rejectionFrom(
      ledger.registerChunk(orgA, id, chunk(3, 'frames'), gcsObject(orgA, id, 3, 'frames')),
    )
    expect(rejection.code).toBe('CONFLICT')
  })
})

describe('org isolation', () => {
  let id = ''

  beforeAll(async () => {
    id = newSessionId()
    await ledger.createSession(orgA, payload(id))
    await ledger.registerChunk(orgA, id, chunk(0, 'meta'), gcsObject(orgA, id, 0, 'meta'))
  })

  it("answers org B's every touch of org A's session as not-found, never forbidden", async () => {
    expect(
      (await rejectionFrom(ledger.registerChunk(orgB, id, chunk(1, 'frames'), gcsObject(orgB, id, 1, 'frames')))).code,
    ).toBe('NOT_FOUND')
    expect((await rejectionFrom(ledger.chunkForVerify(orgB, id, 0))).code).toBe('NOT_FOUND')
    expect((await rejectionFrom(ledger.markVerified(orgB, id, 0))).code).toBe('NOT_FOUND')
    expect((await rejectionFrom(ledger.finalize(orgB, id, 0))).code).toBe('NOT_FOUND')
  })

  it("leaves org A's session untouched by the attempts", async () => {
    expect((await ledger.chunkForVerify(orgA, id, 0)).verified).toBe(false)
  })
})
