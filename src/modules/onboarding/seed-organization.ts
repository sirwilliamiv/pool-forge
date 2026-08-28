// Everything a new organisation needs before its first quote is worth reading.
//
// This is deliberately a function that owns the job rather than a block inside
// whichever route happens to create organisations this week. Registration
// creates one today and invite acceptance will create one tomorrow; both are
// "an organisation was born", and both should call `seedNewOrganization`.
//
// Call it inside the same transaction that creates the Organization row when
// you have one: pass the transaction client and a failure rolls the whole
// signup back rather than leaving an organisation with no book. Call it
// without one and it is still safe to repeat, because it does nothing when the
// organisation already has a price book.

import { Prisma, type PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'
import {
  STARTER_PRICE_BOOK_NAME,
  STARTER_PRICE_BOOK_VERSION,
  STARTER_PRICE_LINES,
  type StarterPriceLine,
} from './starter-price-book'

/**
 * The slice of Prisma this needs.
 *
 * Structural rather than `PrismaClient`, so the same call works against
 * `db` and against the `tx` handed to `db.$transaction`.
 */
export type OnboardingDb = Pick<PrismaClient, 'priceBook' | 'priceBookItem'>

export interface StarterPriceBookResult {
  priceBookId: string
  /** False when the organisation already had a book and nothing was written. */
  created: boolean
  /** Lines in the book. Zero when it already existed. */
  lineCount: number
}

/** The Prisma shape of one starter line. Built field by field, never spread. */
function itemData(
  priceBookId: string,
  line: StarterPriceLine,
): Prisma.PriceBookItemCreateManyInput {
  const data: Prisma.PriceBookItemCreateManyInput = {
    priceBookId,
    category: line.category,
    name: line.name,
    unitType: line.unitType,
    unitCost: new Prisma.Decimal(line.unitCost),
    retailPrice: new Prisma.Decimal(line.retailPrice),
    required: line.required ?? false,
  }
  // `exactOptionalPropertyTypes`: assigning `undefined` is not the same as
  // leaving the key out, and `optionKey: undefined` would be a type error.
  if (line.optionKey !== undefined) data.optionKey = line.optionKey
  return data
}

/**
 * Give an organisation the starter price book, once.
 *
 * Version 1 of the `Default` lineage, which is the same lineage
 * `createBookVersion` copies forward, so a builder's first edit and their
 * fiftieth behave identically: v1 is theirs to change, v2 is a copy of it.
 *
 * Idempotent by the presence of any price book at all rather than by the
 * starter book's own name. An organisation that has imported a spreadsheet, or
 * that a previous version of this app gave an empty `Default` to, must not
 * suddenly find our placeholder prices underneath their real ones.
 */
export async function ensureStarterPriceBook(
  orgId: string,
  client: OnboardingDb = db,
): Promise<StarterPriceBookResult> {
  const existing = await client.priceBook.findFirst({
    where: { orgId },
    orderBy: { version: 'desc' },
    select: { id: true },
  })
  if (existing) return { priceBookId: existing.id, created: false, lineCount: 0 }

  const book = await client.priceBook.create({
    data: {
      orgId,
      name: STARTER_PRICE_BOOK_NAME,
      version: STARTER_PRICE_BOOK_VERSION,
      isActive: true,
    },
    select: { id: true },
  })

  const written = await client.priceBookItem.createMany({
    data: STARTER_PRICE_LINES.map((line) => itemData(book.id, line)),
  })

  return { priceBookId: book.id, created: true, lineCount: written.count }
}

export interface SeedOrganizationResult {
  priceBook: StarterPriceBookResult
}

/**
 * The one call to make when an organisation is created.
 *
 * Everything a new organisation should start life with goes behind this name,
 * so the org-creation path never has to be edited again to add the next thing
 * (a starter material catalogue, a default proposal template). Safe to call
 * more than once, and safe to call on an organisation created before it
 * existed.
 */
export async function seedNewOrganization(
  orgId: string,
  client: OnboardingDb = db,
): Promise<SeedOrganizationResult> {
  const priceBook = await ensureStarterPriceBook(orgId, client)
  return { priceBook }
}
