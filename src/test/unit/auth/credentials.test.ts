// @vitest-environment node
//
// Checking a password, and the migration that rides along with it.
//
// `authorize` in `lib/auth.ts` is three lines of glue over these two functions.
// The glue is proved by an end-to-end sign-in; what is proved here is the part
// with the reasoning in it: that an account which predates Identity Platform
// still signs in, that it moves across exactly once, that a service outage does
// not read as a wrong password, and that a failed sign-in costs the same work
// whether or not the address exists.
//
// Real Postgres (`pnpm db:up`), faked identity client, no network.

import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { checkPassword, migrateToIdentity } from '@/modules/auth/credentials'
import { setIdentityClient } from '@/modules/auth/identity'
import { primeUnknownUserHash } from '@/modules/auth/password'
import { fakeIdentity, type FakeIdentity } from '@/test/fixtures/identity'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('credential tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const describeDb = reachable ? describe : describe.skip

function addr(label: string): string {
  return `crd-${RUN}-${label}@example.test`
}

let identityFake: FakeIdentity

async function wipe(): Promise<void> {
  await db.user.deleteMany({ where: { email: { contains: `crd-${RUN}-` } } })
}

if (reachable) {
  beforeEach(async () => {
    identityFake = fakeIdentity()
    setIdentityClient(identityFake)
    await wipe()
  })
  afterEach(async () => {
    setIdentityClient(null)
    await wipe()
  })
  afterAll(async () => {
    await wipe()
    await db.$disconnect()
  })
}

describeDb('checkPassword', () => {
  it('accepts an Identity Platform account and reports its uid', async () => {
    const uid = identityFake.seed(addr('modern'), 'their-password')
    const result = await checkPassword(
      { identityUid: uid, passwordHash: null },
      addr('modern'),
      'their-password',
    )
    expect(result).toEqual({ ok: true, via: 'identity', uid })
  })

  it('still accepts an account that predates the switch', async () => {
    // The demo account and several agents depend on this. Nobody is told to
    // reset on the day of the switch.
    const hash = await bcrypt.hash('old-password', 4)
    const result = await checkPassword(
      { identityUid: null, passwordHash: hash },
      addr('legacy'),
      'old-password',
    )
    expect(result).toEqual({ ok: true, via: 'legacy' })
  })

  it('refuses an account that has neither credential', async () => {
    const result = await checkPassword(
      { identityUid: null, passwordHash: null },
      addr('empty'),
      'anything',
    )
    expect(result).toEqual({ ok: false })
  })

  it('still does the local work when the identity service refuses', async () => {
    // If the local check were skipped after an identity refusal, a failed
    // sign-in would cost one round trip for an address Identity Platform knows
    // and a round trip plus a bcrypt for one it does not, and a stopwatch would
    // sort a list of addresses into this product's customers.
    //
    // The cost factor here is production's, not the cheap one the rest of this
    // file uses for speed. That is the point: the decoy `verifyCredentialPassword`
    // falls back to is written at cost 12, so comparing it against a cost-4
    // fixture would measure the fixture rather than the code.
    primeUnknownUserHash()
    const hash = await bcrypt.hash('old-password', 12)

    const known = await timed(() =>
      checkPassword({ identityUid: null, passwordHash: hash }, addr('a'), 'wrong'),
    )
    const unknown = await timed(() => checkPassword(null, addr('b'), 'wrong'))

    expect(known.result).toEqual({ ok: false })
    expect(unknown.result).toEqual({ ok: false })
    // Neither path is the fast one: both paid for a real bcrypt.
    expect(known.ms).toBeGreaterThan(20)
    expect(unknown.ms).toBeGreaterThan(20)
    // And they are the same order of magnitude. Deliberately loose: this is
    // about a missing hash, not about milliseconds, and a tight bound here would
    // be a test that fails on a busy machine.
    const ratio = Math.max(known.ms, unknown.ms) / Math.min(known.ms, unknown.ms)
    expect(ratio).toBeLessThan(4)
  })

  it('does not treat an outage as a wrong password for a legacy account', async () => {
    const hash = await bcrypt.hash('old-password', 4)
    identityFake.failNext.verify = { ok: false, failure: 'unavailable', ref: 'err_000000000000' }
    const result = await checkPassword(
      { identityUid: null, passwordHash: hash },
      addr('outage'),
      'old-password',
    )
    expect(result).toEqual({ ok: true, via: 'legacy' })
  })

  it('refuses an account that has moved across, if the service is down', async () => {
    // The other side of the same coin, and the accepted cost: once `passwordHash`
    // is null there is nothing local to fall back to, so an outage is an outage
    // rather than a way around Identity Platform.
    const uid = identityFake.seed(addr('moved'), 'their-password')
    identityFake.failNext.verify = { ok: false, failure: 'unavailable' }
    const result = await checkPassword(
      { identityUid: uid, passwordHash: null },
      addr('moved'),
      'their-password',
    )
    expect(result).toEqual({ ok: false })
  })
})

describeDb('migrateToIdentity', () => {
  it('creates the identity, stores the uid, and drops the local hash', async () => {
    const user = await db.user.create({
      data: { email: addr('move'), passwordHash: await bcrypt.hash('old-password', 4) },
    })

    expect(await migrateToIdentity(user.id, addr('move'), 'old-password')).toBe('migrated')

    const after = await db.user.findUnique({ where: { id: user.id } })
    expect(after?.identityUid).toBe(identityFake.accounts.get(addr('move'))?.uid)
    expect(after?.passwordHash).toBeNull()
    // And the password that now works is the one they typed.
    expect(identityFake.accounts.get(addr('move'))?.password).toBe('old-password')
  })

  it('leaves the account alone when the address is already taken over there', async () => {
    // Pointing the local row at an identity whose password nobody here knows
    // would lock the account out on its next sign-in.
    identityFake.seed(addr('taken'), 'some-other-password')
    const hash = await bcrypt.hash('old-password', 4)
    const user = await db.user.create({ data: { email: addr('taken'), passwordHash: hash } })

    expect(await migrateToIdentity(user.id, addr('taken'), 'old-password')).toBe('deferred')

    const after = await db.user.findUnique({ where: { id: user.id } })
    expect(after?.identityUid).toBeNull()
    expect(after?.passwordHash).toBe(hash)
  })

  it('leaves the account signable when the identity service is down', async () => {
    const hash = await bcrypt.hash('old-password', 4)
    const user = await db.user.create({ data: { email: addr('down'), passwordHash: hash } })
    identityFake.failNext.create = { ok: false, failure: 'unavailable', ref: 'err_000000000000' }

    expect(await migrateToIdentity(user.id, addr('down'), 'old-password')).toBe('deferred')

    const after = await db.user.findUnique({ where: { id: user.id } })
    expect(after?.passwordHash).toBe(hash)
  })
})

async function timed<T>(work: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const started = performance.now()
  const result = await work()
  return { result, ms: performance.now() - started }
}
