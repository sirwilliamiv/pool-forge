// Cutting a version of a price book, and what it must not destroy.
//
// A prospect described the workflow this replaces: one person keeps the price
// list in Excel, six to eight salespeople quote from copies of it, and when
// somebody needs a change they ask the keeper, who "sends out the updated price
// books". Versions are the product's answer to that, so a version has to behave
// like the thing being posted out: a complete list, and the previous one still
// on somebody's desk.

import { PriceCategory, UnitType } from '@prisma/client'
import { vi } from 'vitest'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { createBookVersion } from '@/app/(app)/settings/price-book/actions'

const RUN = Math.random().toString(36).slice(2, 8)
let orgId = ''

// The action reads the org off the session, so the test drives the same path a
// signed-in keeper would.
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: `user-${RUN}`, orgId } }),
}))

// `revalidatePath` needs a request context that a unit test does not have, and
// cache invalidation is not what is under test here.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

beforeEach(async () => {
  const org = await db.organization.create({ data: { name: `Versions ${RUN}` } })
  orgId = org.id
  const book = await db.priceBook.create({
    data: { orgId, name: 'Default', version: 1, isActive: true },
  })
  await db.priceBookItem.createMany({
    data: [
      { priceBookId: book.id, category: PriceCategory.POOL, name: 'Pool base', unitType: UnitType.SQFT, retailPrice: 85, unitCost: 48, required: true },
      { priceBookId: book.id, category: PriceCategory.COPING, name: 'Travertine coping', unitType: UnitType.LF, retailPrice: 42, unitCost: 22 },
    ],
  })
})

describe('cutting a version', () => {
  it('carries the whole list forward', async () => {
    // It used to create an empty book, so a keeper who pressed this lost the
    // list they had spent an afternoon building.
    const next = await createBookVersion()
    expect(next.version).toBe(2)
    expect(next.copied).toBe(2)

    const items = await db.priceBookItem.findMany({ where: { priceBookId: next.id } })
    expect(items.map(i => i.name).sort()).toEqual(['Pool base', 'Travertine coping'])
  })

  it('keeps the prices and the flags, not just the names', async () => {
    const next = await createBookVersion()
    const pool = await db.priceBookItem.findFirst({
      where: { priceBookId: next.id, name: 'Pool base' },
    })
    expect(Number(pool?.retailPrice)).toBe(85)
    expect(Number(pool?.unitCost)).toBe(48)
    expect(pool?.required).toBe(true)
    expect(pool?.unitType).toBe(UnitType.SQFT)
  })

  it('leaves the previous version readable', async () => {
    await createBookVersion()
    const first = await db.priceBook.findFirst({ where: { orgId, version: 1 } })
    const items = await db.priceBookItem.findMany({ where: { priceBookId: first!.id } })
    expect(items).toHaveLength(2)
    expect(first?.isActive).toBe(false)
  })

  it('leaves exactly one version active', async () => {
    await createBookVersion()
    await createBookVersion()
    const active = await db.priceBook.findMany({ where: { orgId, isActive: true } })
    expect(active).toHaveLength(1)
    expect(active[0]?.version).toBe(3)
  })

  it('editing the new version does not reach back into the old one', async () => {
    // The whole point. A quote priced against version 1 has to keep resolving
    // to version 1's numbers after the keeper raises a price.
    const next = await createBookVersion()
    await db.priceBookItem.updateMany({
      where: { priceBookId: next.id, name: 'Pool base' },
      data: { retailPrice: 99 },
    })

    const first = await db.priceBook.findFirst({ where: { orgId, version: 1 } })
    const old = await db.priceBookItem.findFirst({
      where: { priceBookId: first!.id, name: 'Pool base' },
    })
    expect(Number(old?.retailPrice)).toBe(85)
  })
})
