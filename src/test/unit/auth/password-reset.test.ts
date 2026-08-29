// @vitest-environment node
//
// Getting somebody back in, against the real local Postgres. Run `pnpm db:up`.
//
// The property this file exists for is that a reset request behaves the same
// whether or not the address has an account. The browser-visible half of that is
// proved end to end; what is proved here is the half underneath, which is that
// the module returns the same shape and that the ONLY difference between the two
// cases is a row nobody outside the server can see.
//
// Identity Platform is faked at the client boundary: no network, no credential.

import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { setIdentityClient } from '@/modules/auth/identity'
import {
  completePasswordReset,
  mintLocalPasswordReset,
  previewPasswordReset,
  requestPasswordReset,
} from '@/modules/auth/password-reset'
import { hashToken, mintToken } from '@/modules/auth/tokens'
import { fakeIdentity, type FakeIdentity } from '@/test/fixtures/identity'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('reset tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const describeDb = reachable ? describe : describe.skip

function addr(label: string): string {
  return `rst-${RUN}-${label}@example.test`
}

let identityFake: FakeIdentity

async function wipe(): Promise<void> {
  await db.authToken.deleteMany({ where: { email: { contains: `rst-${RUN}-` } } })
  await db.user.deleteMany({ where: { email: { contains: `rst-${RUN}-` } } })
}

/** An account that predates Identity Platform: local hash, no uid. */
async function seedLegacy(label: string, password: string): Promise<string> {
  const user = await db.user.create({
    data: { email: addr(label), passwordHash: await bcrypt.hash(password, 4) },
  })
  return user.id
}

/** An account that lives in Identity Platform. */
async function seedModern(label: string, password: string): Promise<string> {
  const uid = identityFake.seed(addr(label), password)
  const user = await db.user.create({ data: { email: addr(label), identityUid: uid } })
  return user.id
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

describeDb('asking for a reset', () => {
  it('hands an Identity Platform account to Identity Platform', async () => {
    await seedModern('modern', 'their-password')
    const outcome = await requestPasswordReset({
      email: addr('modern'),
      tokenHash: hashToken(mintToken()),
    })
    expect(outcome.channel).toBe('identity')
    expect(identityFake.resets).toEqual([addr('modern')])
    // Nothing of ours is written: Google sends the mail and owns the link.
    expect(await db.authToken.count({ where: { email: addr('modern') } })).toBe(0)
  })

  it('keeps a pre-Identity-Platform account on the local link', async () => {
    // Handing this address to Identity Platform would post a request that
    // succeeds, sends nothing, and strands a real person.
    await seedLegacy('legacy', 'old-password')
    const token = mintToken()
    const outcome = await requestPasswordReset({
      email: addr('legacy'),
      tokenHash: hashToken(token),
    })
    expect(outcome.channel).toBe('local')
    expect(identityFake.resets).toEqual([])

    const preview = await previewPasswordReset(token)
    expect(preview.ok).toBe(true)
  })

  it('does the same visible thing for an address with no account', async () => {
    const outcome = await requestPasswordReset({
      email: addr('ghost'),
      tokenHash: hashToken(mintToken()),
    })
    // The only difference from a known address is a row the caller cannot see,
    // and the caller is given nothing to branch on.
    expect(outcome.channel).toBe('none')
    expect(await db.authToken.count({ where: { email: addr('ghost') } })).toBe(0)
  })

  it('never writes the link, only its hash', async () => {
    await seedLegacy('hashonly', 'old-password')
    const token = mintToken()
    await requestPasswordReset({ email: addr('hashonly'), tokenHash: hashToken(token) })
    const rows = await db.authToken.findMany({ where: { email: addr('hashonly') } })
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('retires the previous link when a second is asked for', async () => {
    await seedLegacy('twice', 'old-password')
    const first = mintToken()
    await requestPasswordReset({ email: addr('twice'), tokenHash: hashToken(first) })
    const second = mintToken()
    await requestPasswordReset({ email: addr('twice'), tokenHash: hashToken(second) })

    expect((await previewPasswordReset(first)).ok).toBe(false)
    expect((await previewPasswordReset(second)).ok).toBe(true)
  })
})

describeDb('setting a new password from a link', () => {
  it('moves the account across to Identity Platform and clears the old hash', async () => {
    const userId = await seedLegacy('migrate', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('migrate'), tokenHash: hashToken(token) })

    const done = await completePasswordReset({ token, password: 'a-brand-new-password' })
    expect(done.ok).toBe(true)

    const user = await db.user.findUnique({ where: { id: userId } })
    expect(user?.identityUid).toBe(identityFake.accounts.get(addr('migrate'))?.uid)
    expect(user?.passwordHash).toBeNull()
    expect(identityFake.accounts.get(addr('migrate'))?.password).toBe('a-brand-new-password')
  })

  it('writes a local hash when Identity Platform is not configured', async () => {
    setIdentityClient(fakeIdentity({ configured: false }))
    const userId = await seedLegacy('offline', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('offline'), tokenHash: hashToken(token) })

    const done = await completePasswordReset({ token, password: 'a-brand-new-password' })
    expect(done.ok).toBe(true)
    const user = await db.user.findUnique({ where: { id: userId } })
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(await bcrypt.compare('a-brand-new-password', user?.passwordHash ?? '')).toBe(true)
  })

  it('works once', async () => {
    const userId = await seedLegacy('once', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('once'), tokenHash: hashToken(token) })

    expect((await completePasswordReset({ token, password: 'first-new-password' })).ok).toBe(true)
    const again = await completePasswordReset({ token, password: 'second-new-password' })
    expect(again.ok).toBe(false)
    if (again.ok) return
    expect(again.refusal).toBe('used')
    expect(identityFake.accounts.get(addr('once'))?.password).toBe('first-new-password')
  })

  it('survives two submissions landing at once', async () => {
    // Same reasoning as invite acceptance: the read that renders the form
    // happens before either transaction opens, so the conditional UPDATE is the
    // only thing standing between two simultaneous clicks and two password
    // writes.
    const userId = await seedLegacy('race', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('race'), tokenHash: hashToken(token) })

    const results = await Promise.all([
      completePasswordReset({ token, password: 'first-new-password' }),
      completePasswordReset({ token, password: 'second-new-password' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    const loser = results.find((r) => !r.ok)
    if (!loser || loser.ok) throw new Error('expected one refusal')
    expect(loser.refusal).toBe('used')
  })

  it('refuses an expired link', async () => {
    const userId = await seedLegacy('stale', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('stale'), tokenHash: hashToken(token) })
    await db.authToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const done = await completePasswordReset({ token, password: 'a-brand-new-password' })
    expect(done.ok).toBe(false)
    if (done.ok) return
    expect(done.refusal).toBe('expired')
    // And the old password is untouched.
    const user = await db.user.findUnique({ where: { id: userId } })
    expect(await bcrypt.compare('old-password', user?.passwordHash ?? '')).toBe(true)
  })

  it('refuses a link nobody issued', async () => {
    const done = await completePasswordReset({ token: mintToken(), password: 'a-good-password' })
    expect(done.ok).toBe(false)
    if (done.ok) return
    expect(done.refusal).toBe('unknown')
  })

  it('refuses a short password without spending the link', async () => {
    const userId = await seedLegacy('short', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('short'), tokenHash: hashToken(token) })

    const first = await completePasswordReset({ token, password: 'short' })
    expect(first.ok).toBe(false)
    const second = await completePasswordReset({ token, password: 'a-good-password' })
    expect(second.ok).toBe(true)
  })

  it('rendering the form does not spend the link', async () => {
    // Mail clients prefetch links. Burning the one use on a prefetch means the
    // person types a password into a form that will refuse them.
    const userId = await seedLegacy('prefetch', 'old-password')
    const token = mintToken()
    await mintLocalPasswordReset({ userId, email: addr('prefetch'), tokenHash: hashToken(token) })

    await previewPasswordReset(token)
    await previewPasswordReset(token)
    expect((await completePasswordReset({ token, password: 'a-good-password' })).ok).toBe(true)
  })
})
