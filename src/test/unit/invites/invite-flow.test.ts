// @vitest-environment node
//
// The invite lifecycle, against the real local Postgres.
//
// The database is not incidental here, it IS the thing under test: single use is
// a conditional UPDATE whose row count is the verdict, and superseding an invite
// is a second write in the same transaction. Neither property survives being
// mocked, and this repo has been bitten before by mocks hiding migration drift.
// Run `pnpm db:up` first.
//
// Identity Platform is faked at the client boundary, so nothing here needs a
// network or a credential. The live service is proved by an end-to-end run.
//
// Every fixture interpolates a run-scoped id, so parallel runs and incomplete
// teardown cannot collide.

import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { setIdentityClient } from '@/modules/auth/identity'
import { registerUser } from '@/modules/auth/register'
import { hashToken, mintToken } from '@/modules/auth/tokens'
import {
  acceptInvite,
  createInvite,
  listPendingInvites,
  previewInvite,
  revokeInvite,
} from '@/modules/invites/invites'
import { listMembers, removeMember, setMemberRole } from '@/modules/invites/team'
import { fakeIdentity, type FakeIdentity } from '@/test/fixtures/identity'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('invite tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

const describeDb = reachable ? describe : describe.skip

function addr(label: string): string {
  return `inv-${RUN}-${label}@example.test`
}

let identityFake: FakeIdentity
let orgId: string
let ownerId: string

/** A fresh organisation with one owner, for each test. */
async function seedOrg(): Promise<void> {
  const org = await db.organization.create({ data: { name: `Test Pools ${RUN}` } })
  orgId = org.id
  const owner = await db.user.create({
    data: {
      email: addr('owner'),
      name: 'Owner Olive',
      passwordHash: await bcrypt.hash('owner-password', 4),
    },
  })
  ownerId = owner.id
  await db.organizationMember.create({ data: { orgId, userId: ownerId, role: 'OWNER' } })
}

async function wipe(): Promise<void> {
  await db.authToken.deleteMany({ where: { email: { contains: `inv-${RUN}-` } } })
  await db.organizationMember.deleteMany({ where: { user: { email: { contains: `inv-${RUN}-` } } } })
  await db.user.deleteMany({ where: { email: { contains: `inv-${RUN}-` } } })
  await db.organization.deleteMany({ where: { name: `Test Pools ${RUN}` } })
}

/** Issue an invite and hand back the raw link token, as the action does. */
async function invite(
  email: string,
  role: 'OWNER' | 'ADMIN' | 'MEMBER' = 'MEMBER',
  actorUserId = ownerId,
): Promise<{ token: string; result: Awaited<ReturnType<typeof createInvite>> }> {
  const token = mintToken()
  const result = await createInvite({
    orgId,
    actorUserId,
    email,
    role,
    tokenHash: hashToken(token),
  })
  return { token, result }
}

if (reachable) {
  beforeEach(async () => {
    identityFake = fakeIdentity()
    setIdentityClient(identityFake)
    await wipe()
    await seedOrg()
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

describeDb('issuing an invite', () => {
  it('stores only the hash of the link, never the link', async () => {
    const { token, result } = await invite(addr('new'))
    expect(result.ok).toBe(true)

    const rows = await db.authToken.findMany({ where: { orgId, kind: 'INVITE' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tokenHash).toBe(hashToken(token))
    // A dump of this table must grant nobody an account.
    expect(JSON.stringify(rows)).not.toContain(token)
  })

  it('lower-cases the address, because Sam@ and sam@ are one person', async () => {
    const { token } = await invite(`INV-${RUN}-Mixed@Example.TEST`)
    const preview = await previewInvite(token)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.preview.email).toBe(`inv-${RUN}-mixed@example.test`)
  })

  it('refuses to invite somebody who is already on the team, by name', async () => {
    const { result } = await invite(addr('owner'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Owner Olive')
    expect(result.error).not.toContain(orgId)
  })

  it('refuses a plain member who tries to invite', async () => {
    const memberUser = await db.user.create({
      data: { email: addr('plain'), passwordHash: await bcrypt.hash('x', 4) },
    })
    await db.organizationMember.create({
      data: { orgId, userId: memberUser.id, role: 'MEMBER' },
    })
    const { result } = await invite(addr('nope'), 'MEMBER', memberUser.id)
    expect(result.ok).toBe(false)
  })

  it('replaces an outstanding invite rather than adding a second live link', async () => {
    const first = await invite(addr('resend'))
    const second = await invite(addr('resend'))
    expect(second.result.ok).toBe(true)

    // Only the newest is pending, and the older link no longer opens.
    const pending = await listPendingInvites(orgId)
    expect(pending).toHaveLength(1)
    const stale = await previewInvite(first.token)
    expect(stale.ok).toBe(false)
    const fresh = await previewInvite(second.token)
    expect(fresh.ok).toBe(true)
  })
})

describeDb('accepting an invite', () => {
  it('creates the account in Identity Platform and joins it with the invited role', async () => {
    const { token } = await invite(addr('sam'), 'ADMIN')
    const accepted = await acceptInvite({ token, password: 'a-good-password', name: 'Sam' })

    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.accepted.outcome).toBe('created')
    expect(accepted.accepted.role).toBe('ADMIN')

    const user = await db.user.findUnique({ where: { email: addr('sam') } })
    // Identity Platform holds the credential; nothing local does.
    expect(user?.identityUid).toBe(identityFake.accounts.get(addr('sam'))?.uid)
    expect(user?.passwordHash).toBeNull()

    const members = await listMembers(orgId)
    expect(members.find((m) => m.email === addr('sam'))?.role).toBe('ADMIN')
  })

  it('accepts a link addressed to Sam@ when the recipient types sam@', async () => {
    const { token } = await invite(`INV-${RUN}-Case@Example.TEST`)
    const accepted = await acceptInvite({ token, password: 'a-good-password' })
    expect(accepted.ok).toBe(true)
    const user = await db.user.findUnique({ where: { email: `inv-${RUN}-case@example.test` } })
    expect(user).not.toBeNull()
  })

  it('cannot be used twice, and says so rather than pretending', async () => {
    const { token } = await invite(addr('twice'))
    const first = await acceptInvite({ token, password: 'a-good-password' })
    expect(first.ok).toBe(true)

    const second = await acceptInvite({ token, password: 'a-good-password' })
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.error).toMatch(/already been used/i)

    // And exactly one account came out of it.
    expect(await db.user.count({ where: { email: addr('twice') } })).toBe(1)
  })

  it('survives two clicks landing at once, creating one account', async () => {
    // The reason single use is a conditional UPDATE inside the transaction and
    // not a read-then-write. Both calls get past the read: it happens before
    // either transaction opens, and at that moment the token really is unspent.
    const { token } = await invite(addr('race'))
    const results = await Promise.all([
      acceptInvite({ token, password: 'a-good-password' }),
      acceptInvite({ token, password: 'a-good-password' }),
    ])

    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await db.user.count({ where: { email: addr('race') } })).toBe(1)

    // And the loser is refused BY THE TOKEN, in words a person can act on.
    //
    // This assertion is the whole test. Without it the unique index on
    // `User.email` passes it: both calls claim the token, both try to insert,
    // and the second dies on the constraint, which still leaves one success and
    // one account. The difference is what the second person sees, and "could not
    // create account (ref err_1a2b3c)" is the shape of a race that was never
    // handled.
    const loser = results.find((r) => !r.ok)
    expect(loser).toBeDefined()
    if (!loser || loser.ok) return
    expect(loser.error).toMatch(/already been used|is not valid|has expired/i)
    expect(loser.error).not.toMatch(/ref err_/)
  })

  it('refuses an expired link', async () => {
    const { token } = await invite(addr('stale'))
    await db.authToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const accepted = await acceptInvite({ token, password: 'a-good-password' })
    expect(accepted.ok).toBe(false)
    if (accepted.ok) return
    expect(accepted.error).toMatch(/expired/i)
    expect(await db.user.count({ where: { email: addr('stale') } })).toBe(0)
  })

  it('refuses a link that was revoked', async () => {
    const { token, result } = await invite(addr('revoked'))
    if (!result.ok) throw new Error('setup failed')
    const revoked = await revokeInvite({
      orgId,
      actorUserId: ownerId,
      inviteId: result.invite.inviteId,
    })
    expect(revoked.ok).toBe(true)

    const accepted = await acceptInvite({ token, password: 'a-good-password' })
    expect(accepted.ok).toBe(false)
    expect(await db.user.count({ where: { email: addr('revoked') } })).toBe(0)
  })

  it('refuses a password that is too short, and burns nothing', async () => {
    const { token } = await invite(addr('short'))
    const accepted = await acceptInvite({ token, password: 'short' })
    expect(accepted.ok).toBe(false)
    // The link still works afterwards: a typo must not cost somebody their invite.
    const retry = await acceptInvite({ token, password: 'a-good-password' })
    expect(retry.ok).toBe(true)
  })

  it('joins an address that already has an account, once it proves the password', async () => {
    // The judgement call: an existing account is JOINED, not overwritten. An
    // invite link must not be a way to set the password of an account that has
    // nothing to do with the inviting organisation.
    const other = await db.organization.create({ data: { name: `Test Pools ${RUN}` } })
    const existing = await db.user.create({
      data: { email: addr('veteran'), name: 'Vera', identityUid: `uid-${RUN}-veteran` },
    })
    await db.organizationMember.create({
      data: { orgId: other.id, userId: existing.id, role: 'OWNER' },
    })
    identityFake.seed(addr('veteran'), 'veterans-password', `uid-${RUN}-veteran`)

    const { token } = await invite(addr('veteran'), 'MEMBER')

    const wrong = await acceptInvite({ token, password: 'not-their-password' })
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error).toMatch(/invalid email or password/i)

    const right = await acceptInvite({ token, password: 'veterans-password' })
    expect(right.ok).toBe(true)
    if (!right.ok) return
    expect(right.accepted.outcome).toBe('joined')

    // Two memberships, one account, and the password is untouched.
    const memberships = await db.organizationMember.findMany({ where: { userId: existing.id } })
    expect(memberships).toHaveLength(2)
    expect(identityFake.accounts.get(addr('veteran'))?.password).toBe('veterans-password')
  })

  it('tells the preview that the address already has an account', async () => {
    identityFake.seed(addr('known'), 'their-password')
    await db.user.create({ data: { email: addr('known'), identityUid: `uid-${RUN}-known` } })
    const { token } = await invite(addr('known'))
    const preview = await previewInvite(token)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.preview.hasAccount).toBe(true)
  })

  it('spends the link and stays calm when they are already a member', async () => {
    identityFake.seed(addr('already'), 'their-password')
    const user = await db.user.create({
      data: { email: addr('already'), identityUid: `uid-${RUN}-already` },
    })
    const { token } = await invite(addr('already'))
    // They join another way (or the invite crossed with a manual add).
    await db.organizationMember.create({ data: { orgId, userId: user.id, role: 'MEMBER' } })

    const accepted = await acceptInvite({ token, password: 'their-password' })
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.accepted.outcome).toBe('already-member')
    expect(await db.organizationMember.count({ where: { orgId, userId: user.id } })).toBe(1)
  })

  it('falls back to a local password when Identity Platform is not configured', async () => {
    // The app must still work with no API key set, because several tracks and
    // the whole suite run against a tree that has none.
    setIdentityClient(fakeIdentity({ configured: false }))
    const { token } = await invite(addr('offline'))
    const accepted = await acceptInvite({ token, password: 'a-good-password' })
    expect(accepted.ok).toBe(true)

    const user = await db.user.findUnique({ where: { email: addr('offline') } })
    expect(user?.identityUid).toBeNull()
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/)
  })
})

describeDb('managing the team', () => {
  it('does not let a plain member change roles or remove anybody', async () => {
    // Note what this does NOT prove. It is the "you are not a keeper" rule that
    // refuses here, not the last-owner rule: a member is turned away before
    // owner counting is ever reached. The last-owner rule is checked directly in
    // permissions.test.ts, where the actor can be given a role that gets past
    // the first gate.
    const second = await db.user.create({
      data: { email: addr('second'), identityUid: `uid-${RUN}-second` },
    })
    await db.organizationMember.create({ data: { orgId, userId: second.id, role: 'MEMBER' } })

    const demote = await setMemberRole({
      orgId,
      actorUserId: second.id,
      subjectUserId: ownerId,
      role: 'MEMBER',
    })
    expect(demote.ok).toBe(false)

    const remove = await removeMember({
      orgId,
      actorUserId: second.id,
      subjectUserId: ownerId,
    })
    expect(remove.ok).toBe(false)
    expect(await db.organizationMember.count({ where: { orgId, role: 'OWNER' } })).toBe(1)
    expect(await db.organizationMember.count({ where: { orgId } })).toBe(2)
  })

  it('refuses to empty the owner seat even when asked by an owner', async () => {
    // The last-owner rule reaching the database. The actor here is the owner
    // themselves, which is the only actor that gets past the keeper gate in an
    // organisation with one owner.
    const demote = await setMemberRole({
      orgId,
      actorUserId: ownerId,
      subjectUserId: ownerId,
      role: 'MEMBER',
    })
    expect(demote.ok).toBe(false)

    const remove = await removeMember({ orgId, actorUserId: ownerId, subjectUserId: ownerId })
    expect(remove.ok).toBe(false)
    expect(await db.organizationMember.count({ where: { orgId, role: 'OWNER' } })).toBe(1)
  })

  it('retires an outstanding invite when somebody is removed', async () => {
    const leaver = await db.user.create({
      data: { email: addr('leaver'), identityUid: `uid-${RUN}-leaver` },
    })
    await db.organizationMember.create({ data: { orgId, userId: leaver.id, role: 'MEMBER' } })
    // An invite that crossed in the post.
    const token = mintToken()
    await db.authToken.create({
      data: {
        kind: 'INVITE',
        email: addr('leaver'),
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60_000),
        orgId,
        role: 'MEMBER',
      },
    })

    const removed = await removeMember({ orgId, actorUserId: ownerId, subjectUserId: leaver.id })
    expect(removed.ok).toBe(true)
    // They must not walk back in through a link already in their inbox.
    const preview = await previewInvite(token)
    expect(preview.ok).toBe(false)
  })

  it('never lets one organisation reach into another', async () => {
    const stranger = await db.organization.create({ data: { name: `Test Pools ${RUN}` } })
    const strangerUser = await db.user.create({
      data: { email: addr('stranger'), identityUid: `uid-${RUN}-stranger` },
    })
    await db.organizationMember.create({
      data: { orgId: stranger.id, userId: strangerUser.id, role: 'MEMBER' },
    })

    const result = await setMemberRole({
      orgId,
      actorUserId: ownerId,
      subjectUserId: strangerUser.id,
      role: 'ADMIN',
    })
    expect(result.ok).toBe(false)
    const untouched = await db.organizationMember.findFirst({
      where: { orgId: stranger.id, userId: strangerUser.id },
    })
    expect(untouched?.role).toBe('MEMBER')
  })
})

describeDb('self-service registration', () => {
  it('creates nothing, whatever it is handed', async () => {
    const before = await db.user.count()
    const result = await registerUser({
      email: addr('walkup'),
      password: 'a-good-password',
      name: 'Walk Up',
      orgName: 'Walk Up Pools',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/invite only/i)
    expect(await db.user.count()).toBe(before)
    expect(await db.user.count({ where: { email: addr('walkup') } })).toBe(0)
  })

  it('says nothing about whether the address already exists', async () => {
    // The old implementation answered "an account with that email already
    // exists", which was an enumeration oracle the throttle only made expensive.
    const unknown = await registerUser({ email: addr('ghost'), password: 'a-good-password' })
    const known = await registerUser({ email: addr('owner'), password: 'a-good-password' })
    expect(unknown).toEqual(known)
  })
})
