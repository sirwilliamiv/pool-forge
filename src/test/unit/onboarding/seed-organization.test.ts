// Seeding a brand new organisation, against the real database.
//
// The claim being tested is the one in the brief: an organisation created today
// can quote today. Not "the constant list is well formed" (that is
// starter-price-book.test.ts) but "the rows land, they land once, and the book
// they land in is version 1 of the lineage every later version continues".

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PriceCategory, UnitType } from '@prisma/client'

import { db } from '@/lib/db'
import { computeQuote, toPriceBookItems } from '@/modules/pricing/engine'
import type { MeasurementSummary } from '@/modules/measurements/engine'
import {
  ensureStarterPriceBook,
  seedNewOrganization,
} from '@/modules/onboarding/seed-organization'
import { STARTER_PRICE_LINES } from '@/modules/onboarding/starter-price-book'
import { createBookVersion } from '@/app/(app)/settings/price-book/actions'

const RUN = Math.random().toString(36).slice(2, 8)
let orgId = ''

// `createBookVersion` reads the org off the session, so the lineage test drives
// the same path a signed-in builder would.
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: `user-${RUN}`, orgId } }),
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

beforeEach(async () => {
  const org = await db.organization.create({ data: { name: `Onboarding ${RUN}` } })
  orgId = org.id
})

describe('a brand new organisation', () => {
  it('is given the whole starter book, active, at version 1', async () => {
    const result = await seedNewOrganization(orgId)
    expect(result.priceBook.created).toBe(true)
    expect(result.priceBook.lineCount).toBe(STARTER_PRICE_LINES.length)

    const book = await db.priceBook.findFirstOrThrow({
      where: { orgId },
      include: { items: true },
    })
    expect(book.name).toBe('Default')
    expect(book.version).toBe(1)
    expect(book.isActive).toBe(true)
    expect(book.items).toHaveLength(STARTER_PRICE_LINES.length)
  })

  it('keeps the prices, the units and the flags it was given', async () => {
    await seedNewOrganization(orgId)
    const items = await db.priceBookItem.findMany({ where: { priceBook: { orgId } } })
    const pump = items.find((item) => item.name.startsWith('Pump'))
    expect(pump?.required).toBe(true)
    expect(pump?.unitType).toBe(UnitType.EACH)
    expect(Number(pump?.retailPrice)).toBe(1750)
    expect(Number(pump?.unitCost)).toBe(850)

    const heater = items.find((item) => item.name.startsWith('Heater'))
    expect(heater?.optionKey).toBe('heater')

    const shell = items.find((item) => item.name.startsWith('Pool shell'))
    expect(shell?.category).toBe(PriceCategory.POOL)
    expect(shell?.optionKey).toBeNull()
  })

  it('prices a drawing straight out of the database', async () => {
    // The end of the story: rows written by the seeder, read back the way the
    // editor reads them, handed to the same engine the proposal runs.
    await seedNewOrganization(orgId)
    const book = await db.priceBook.findFirstOrThrow({
      where: { orgId, isActive: true },
      include: { items: true },
    })
    const measurements: MeasurementSummary = {
      poolSurfaceArea: 400,
      poolPerimeter: 82,
      poolGallons: 16000,
      poolWettedArea: 520,
      poolLengthFt: 25,
      poolWidthFt: 16,
      poolDepthShallow: 3,
      poolDepthDeep: 6,
      poolAvgDepth: 4.5,
      deckArea: 0,
      copingLinearFeet: 0,
      decoDrainLinearFeet: 0,
      benchLinearFeet: 0,
      featureCount: 0,
      spaCount: 0,
      lightCount: 0,
      waterFeatureCount: 0,
      hasPool: true,
      hasDeck: false,
      cutYards: 0,
      fillYards: 0,
      maxSlopePct: 0,
    }
    const quote = computeQuote(toPriceBookItems(book.items), measurements, {}, { taxRatePct: 6 })
    expect(quote.status).toBe('PRICED')
    expect(quote.total).toBeGreaterThan(0)
  })
})

describe('seeding twice', () => {
  it('writes nothing the second time', async () => {
    await seedNewOrganization(orgId)
    const again = await seedNewOrganization(orgId)
    expect(again.priceBook.created).toBe(false)
    expect(again.priceBook.lineCount).toBe(0)

    const books = await db.priceBook.count({ where: { orgId } })
    const items = await db.priceBookItem.count({ where: { priceBook: { orgId } } })
    expect(books).toBe(1)
    expect(items).toBe(STARTER_PRICE_LINES.length)
  })

  it('leaves a book somebody already built completely alone', async () => {
    // An organisation that imported a spreadsheet, or that an older version of
    // this app gave an empty book to, must not find our placeholder prices
    // underneath their real ones.
    const theirs = await db.priceBook.create({
      data: { orgId, name: 'Default', version: 1, isActive: true },
    })
    await db.priceBookItem.create({
      data: {
        priceBookId: theirs.id,
        category: PriceCategory.POOL,
        name: 'Their own shell price',
        unitType: UnitType.SQFT,
        retailPrice: 101,
        unitCost: 44,
      },
    })

    const result = await seedNewOrganization(orgId)
    expect(result.priceBook.created).toBe(false)

    const items = await db.priceBookItem.findMany({ where: { priceBook: { orgId } } })
    expect(items.map((item) => item.name)).toEqual(['Their own shell price'])
  })
})

describe('seeding inside the transaction that creates the organisation', () => {
  it('rolls back with it', async () => {
    // The call site is an org-creation path, and half a signup is worse than
    // none: an organisation with no book quotes every job at nothing.
    const name = `Rollback ${RUN}`
    await expect(
      db.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name } })
        await ensureStarterPriceBook(org.id, tx)
        throw new Error('signup failed after the org was created')
      }),
    ).rejects.toThrow('signup failed')

    expect(await db.organization.count({ where: { name } })).toBe(0)
  })

  it('commits with it', async () => {
    const name = `Commit ${RUN}`
    const created = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name } })
      await ensureStarterPriceBook(org.id, tx)
      return org.id
    })
    expect(await db.priceBookItem.count({ where: { priceBook: { orgId: created } } })).toBe(
      STARTER_PRICE_LINES.length,
    )
  })
})

describe('the starter book is version 1 of the real lineage', () => {
  it("a builder's first new version copies it forward rather than forking", async () => {
    // The starter book has to be called what `createBookVersion` looks for. A
    // book under any other name would be left behind and deactivated the first
    // time somebody cut a version, and they would lose the list.
    await seedNewOrganization(orgId)
    const next = await createBookVersion()
    expect(next.version).toBe(2)
    expect(next.copied).toBe(STARTER_PRICE_LINES.length)

    const books = await db.priceBook.findMany({ where: { orgId }, orderBy: { version: 'asc' } })
    expect(books.map((book) => `${book.name} v${book.version} ${book.isActive}`)).toEqual([
      'Default v1 false',
      'Default v2 true',
    ])
  })
})
