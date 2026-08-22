// Integration test: hits the real local Postgres (`pnpm db:up`).
//
// A Live session bills continuously for as long as it is open, so the cap is the
// thing standing between a mistake and a bill. The check has to be a single
// guarded statement: two clients starting at once both pass a separate count,
// and N instances each enforcing a local limit collectively allow N times the
// intended ceiling.

import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  MAX_CONCURRENT_SESSIONS,
  beginVoiceSession,
  endVoiceSession,
  openSessionCount,
  secondsUsedToday,
} from '@/modules/voice/usage'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('voice usage tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

describe.skipIf(!reachable)('voice session budget', () => {
  let orgA = ''
  let orgB = ''

  beforeAll(async () => {
    orgA = (await db.organization.create({ data: { name: `Voice A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Voice B ${RUN}` } })).id
  })

  afterEach(async () => {
    await db.voiceSession.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
  })

  it('allows a session when there is room', async () => {
    const result = await beginVoiceSession(orgA, null)
    expect(result.ok).toBe(true)
    expect(await openSessionCount(orgA)).toBe(1)
  })

  it('holds the ceiling when sessions start simultaneously', async () => {
    // The reason this is one guarded INSERT rather than a count and a create.
    // Started together, so no request sees another's row before deciding.
    const attempts = MAX_CONCURRENT_SESSIONS + 4
    const results = await Promise.all(
      Array.from({ length: attempts }, () => beginVoiceSession(orgA, null)),
    )

    const granted = results.filter(result => result.ok).length
    expect(granted, 'the cap was overspent under concurrency').toBe(MAX_CONCURRENT_SESSIONS)
    expect(await openSessionCount(orgA)).toBe(MAX_CONCURRENT_SESSIONS)
  })

  it('says which limit was hit, because the instructions differ', async () => {
    // "Close your other window" and "come back tomorrow" are different answers.
    await Promise.all(
      Array.from({ length: MAX_CONCURRENT_SESSIONS }, () => beginVoiceSession(orgA, null)),
    )
    const refused = await beginVoiceSession(orgA, null)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toBe('concurrent')
    expect(refused.message.length).toBeGreaterThan(10)
  })

  it('frees the slot when the session ends', async () => {
    const first = await beginVoiceSession(orgA, null)
    expect(first.ok).toBe(true)
    if (!first.ok) return

    await endVoiceSession(first.sessionId, orgA)
    expect(await openSessionCount(orgA)).toBe(0)
  })

  it('records the time a session used', async () => {
    const started = await beginVoiceSession(orgA, null)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    await endVoiceSession(started.sessionId, orgA)
    // Same second, so zero is the honest answer; what matters is that a row was
    // closed and counted rather than left open.
    expect(await secondsUsedToday(orgA)).toBeGreaterThanOrEqual(0)
    const row = await db.voiceSession.findUnique({ where: { id: started.sessionId } })
    expect(row?.endedAt).not.toBeNull()
  })

  it('will not let one organisation close another organisation session', async () => {
    // A session id would otherwise be a bearer token for freeing someone else's
    // slot.
    const theirs = await beginVoiceSession(orgB, null)
    expect(theirs.ok).toBe(true)
    if (!theirs.ok) return

    await endVoiceSession(theirs.sessionId, orgA)
    expect(await openSessionCount(orgB), 'their session was closed by another org').toBe(1)
  })

  it('counts organisations separately', async () => {
    await Promise.all(
      Array.from({ length: MAX_CONCURRENT_SESSIONS }, () => beginVoiceSession(orgA, null)),
    )
    // One org at its ceiling must not block another.
    expect((await beginVoiceSession(orgB, null)).ok).toBe(true)
  })

  it('refuses once the daily minutes are spent', async () => {
    // Backdated rather than waited for: the limit is on time used today, and a
    // test that actually burned two hours would never run.
    await db.voiceSession.create({
      data: { orgId: orgB, seconds: 60 * 60 * 24, endedAt: new Date() },
    })

    const refused = await beginVoiceSession(orgB, null)
    expect(refused.ok).toBe(false)
    if (refused.ok) return
    expect(refused.reason).toBe('daily')
  })

  it('does not let a crashed session lock the organisation out forever', async () => {
    // A client that dies never sends its close. Without a staleness window the
    // row holds a slot indefinitely.
    const longAgo = new Date(Date.now() - 1000 * 60 * 60 * 6)
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i++) {
      await db.voiceSession.create({ data: { orgId: orgA, startedAt: longAgo } })
    }
    expect(await openSessionCount(orgA)).toBe(0)
    expect((await beginVoiceSession(orgA, null)).ok).toBe(true)
  })
})
