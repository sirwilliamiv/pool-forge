// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// Price book CRUD used to be direct Prisma in `settings/price-book/actions.ts`
// with no audit row and no way for voice to reach it: a builder could price a
// job but not touch a price by voice. These pin the same edits running through
// the registry instead, plus the read-only describe that reuses the price book
// page's own coverage computation.

import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import type { CommandContext } from '@/modules/commands/registry'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn(
    'price book integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.',
  )
}

const createdOrgIds: string[] = []

interface BootstrappedOrg {
  orgId: string
  userId: string
}

/**
 * A fresh organisation, scoped to this run and this call so parallel tests
 * never collide on the `orgId_name_version` unique index a price book sits
 * behind.
 */
async function bootstrapOrg(): Promise<BootstrappedOrg> {
  const suffix = randomUUID().slice(0, 8)
  const org = await db.organization.create({ data: { name: `Pricebook ${RUN} ${suffix}` } })
  createdOrgIds.push(org.id)
  // No real user row: these commands never read ctx.userId, and 'anonymous'
  // is the sentinel `dispatchCommand`'s audit write already maps to a null
  // user rather than a foreign key it would have to satisfy.
  return { orgId: org.id, userId: 'anonymous' }
}

afterAll(async () => {
  if (!reachable || createdOrgIds.length === 0) return
  await db.commandAuditLog.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.priceBookItem.deleteMany({ where: { priceBook: { orgId: { in: createdOrgIds } } } })
  await db.priceBook.deleteMany({ where: { orgId: { in: createdOrgIds } } })
  await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } })
})

describe.skipIf(!reachable)('price book commands', () => {
  it('adds, updates, describes and removes a price book item', async () => {
    const { orgId, userId } = await bootstrapOrg()
    const ctx: CommandContext = { userId, orgId }

    const added = await dispatchCommand(
      'pricebook.item.add',
      { category: 'EARTHWORK', name: `Dig ${orgId}`, unitType: 'CUYD', retailPrice: 4500 },
      ctx,
      'API',
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const itemId = (added.data as { itemId: string }).itemId

    const stored = await db.priceBookItem.findUniqueOrThrow({ where: { id: itemId } })
    expect(stored.category).toBe('EARTHWORK')
    expect(Number(stored.retailPrice)).toBe(4500)

    const updated = await dispatchCommand(
      'pricebook.item.update',
      { itemId, retailPrice: 4800 },
      ctx,
      'API',
    )
    expect(updated.ok).toBe(true)
    expect(Number((await db.priceBookItem.findUniqueOrThrow({ where: { id: itemId } })).retailPrice)).toBe(
      4800,
    )

    const described = await dispatchCommand('pricebook.describe', {}, ctx, 'API')
    expect(described.ok).toBe(true)
    if (!described.ok) return
    expect((described.data as { itemCount: number }).itemCount).toBeGreaterThan(0)

    const removed = await dispatchCommand('pricebook.item.remove', { itemId }, ctx, 'API')
    expect(removed.ok).toBe(true)
    expect(await db.priceBookItem.findUnique({ where: { id: itemId } })).toBeNull()
  })

  it('refuses an update with no fields to change', async () => {
    const { orgId, userId } = await bootstrapOrg()
    const ctx: CommandContext = { userId, orgId }

    const added = await dispatchCommand(
      'pricebook.item.add',
      { category: 'EARTHWORK', name: `Dig ${orgId}`, unitType: 'CUYD', retailPrice: 4500 },
      ctx,
      'API',
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const itemId = (added.data as { itemId: string }).itemId

    const updated = await dispatchCommand('pricebook.item.update', { itemId }, ctx, 'API')
    expect(updated.ok).toBe(false)
    // Refused before it ever reaches the database, so nothing changed and no
    // "updated" audit row gets written for a no-op.
    expect(Number((await db.priceBookItem.findUniqueOrThrow({ where: { id: itemId } })).retailPrice)).toBe(
      4500,
    )
  })

  it("refuses another org's price book item", async () => {
    const a = await bootstrapOrg()
    const b = await bootstrapOrg()

    const added = await dispatchCommand(
      'pricebook.item.add',
      { category: 'POOL', name: `Pool base ${a.orgId}`, unitType: 'SQFT', retailPrice: 85 },
      { userId: a.userId, orgId: a.orgId },
      'API',
    )
    expect(added.ok).toBe(true)
    if (!added.ok) return
    const itemId = (added.data as { itemId: string }).itemId

    const update = await dispatchCommand(
      'pricebook.item.update',
      { itemId, retailPrice: 1 },
      { userId: b.userId, orgId: b.orgId },
      'API',
    )
    expect(update.ok).toBe(false)

    const remove = await dispatchCommand(
      'pricebook.item.remove',
      { itemId },
      { userId: b.userId, orgId: b.orgId },
      'API',
    )
    expect(remove.ok).toBe(false)
    expect(await db.priceBookItem.findUnique({ where: { id: itemId } })).not.toBeNull()
  })

  it('writes exactly one audit row per dispatch, success or failure', async () => {
    const { orgId, userId } = await bootstrapOrg()
    const ctx: CommandContext = { userId, orgId }

    await dispatchCommand(
      'pricebook.item.add',
      { category: 'MISC', name: `Permit ${orgId}`, unitType: 'LUMP', retailPrice: 250 },
      ctx,
      'API',
    )
    const ok = await db.commandAuditLog.findMany({ where: { orgId, commandId: 'pricebook.item.add' } })
    expect(ok).toHaveLength(1)
    expect(ok[0]?.success).toBe(true)
    expect(ok[0]?.source).toBe('API')

    await dispatchCommand('pricebook.item.remove', { itemId: 'not-a-real-id' }, ctx, 'API')
    const failed = await db.commandAuditLog.findMany({
      where: { orgId, commandId: 'pricebook.item.remove' },
    })
    expect(failed).toHaveLength(1)
    expect(failed[0]?.success).toBe(false)
  })
})
