'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PriceCategory, UnitType } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { PRICING_OPTIONS } from '@/modules/pricing/engine'

const ItemInputSchema = z.object({
  category: z.nativeEnum(PriceCategory),
  name: z.string().min(1).max(120),
  unitType: z.nativeEnum(UnitType),
  retailPrice: z.number().min(0),
  unitCost: z.number().min(0).optional(),
  customerVisible: z.boolean().default(true),
  internalOnly: z.boolean().default(false),
  required: z.boolean().default(false),
  upgradeOnly: z.boolean().default(false),
  /**
   * Which customer selection turns this line on, or null for "billed by its
   * category rule", which is what every item did before this existed.
   *
   * Constrained to the options the app actually asks the customer about. A key
   * nobody can tick would be a line that never bills and never says why, which
   * is the shape of the bug this field exists to close rather than repeat.
   */
  optionKey: z.enum(PRICING_OPTIONS).nullable().default(null),
})

export type ItemInput = z.infer<typeof ItemInputSchema>

async function requireOrgId(): Promise<string> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) throw new Error('Not authenticated')
  return orgId
}

export async function getOrCreateActiveBookId(orgId: string): Promise<string> {
  const existing = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await db.priceBook.upsert({
    where: { orgId_name_version: { orgId, name: 'Default', version: 1 } },
    create: { orgId, name: 'Default', version: 1, isActive: true },
    update: { isActive: true },
    select: { id: true },
  })
  return created.id
}

export async function createItem(input: ItemInput): Promise<{ id: string }> {
  const orgId = await requireOrgId()
  const data = ItemInputSchema.parse(input)
  const priceBookId = await getOrCreateActiveBookId(orgId)

  const row = await db.priceBookItem.create({
    data: {
      priceBookId,
      category: data.category,
      name: data.name,
      unitType: data.unitType,
      retailPrice: data.retailPrice,
      unitCost: data.unitCost ?? 0,
      customerVisible: data.customerVisible,
      internalOnly: data.internalOnly,
      required: data.required,
      upgradeOnly: data.upgradeOnly,
      optionKey: data.optionKey,
    },
    select: { id: true },
  })

  revalidatePath('/settings/price-book')
  return { id: row.id }
}

export async function updateItem(itemId: string, patch: Partial<ItemInput>): Promise<{ ok: true }> {
  const orgId = await requireOrgId()
  const data = ItemInputSchema.partial().parse(patch)

  const owned = await db.priceBookItem.findFirst({
    where: { id: itemId, priceBook: { orgId } },
    select: { id: true },
  })
  if (!owned) throw new Error('Item not found')

  const updateData: Record<string, unknown> = {}
  if (data.category !== undefined) updateData.category = data.category
  if (data.name !== undefined) updateData.name = data.name
  if (data.unitType !== undefined) updateData.unitType = data.unitType
  if (data.retailPrice !== undefined) updateData.retailPrice = data.retailPrice
  if (data.unitCost !== undefined) updateData.unitCost = data.unitCost
  if (data.customerVisible !== undefined) updateData.customerVisible = data.customerVisible
  if (data.internalOnly !== undefined) updateData.internalOnly = data.internalOnly
  if (data.required !== undefined) updateData.required = data.required
  if (data.upgradeOnly !== undefined) updateData.upgradeOnly = data.upgradeOnly
  // Explicit null is a real edit here ("stop gating this line"), so the check
  // is against `undefined` rather than a truthiness test.
  if (data.optionKey !== undefined) updateData.optionKey = data.optionKey

  await db.priceBookItem.update({ where: { id: itemId }, data: updateData })
  revalidatePath('/settings/price-book')
  return { ok: true }
}

export async function deleteItem(itemId: string): Promise<{ ok: true }> {
  const orgId = await requireOrgId()
  const owned = await db.priceBookItem.findFirst({
    where: { id: itemId, priceBook: { orgId } },
    select: { id: true },
  })
  if (!owned) throw new Error('Item not found')

  await db.priceBookItem.delete({ where: { id: itemId } })
  revalidatePath('/settings/price-book')
  return { ok: true }
}

/**
 * Cut a new version of the price book, carrying the current one forward.
 *
 * It used to create an empty book and deactivate the old one, which is not a
 * new version of anything: a builder pressing it lost their entire price list
 * and had to rebuild it from nothing. A version is a copy you can edit while
 * the one it came from stays readable.
 *
 * The copy is what makes the old version safe to keep: edits land on the new
 * book, and anything already priced against the old one still resolves to the
 * numbers it was priced with.
 */
export async function createBookVersion(): Promise<{ id: string; version: number; copied: number }> {
  const orgId = await requireOrgId()

  return db.$transaction(async (tx) => {
    const current = await tx.priceBook.findFirst({
      where: { orgId, name: 'Default' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    })
    const version = (current?.version ?? 0) + 1

    await tx.priceBook.updateMany({ where: { orgId, isActive: true }, data: { isActive: false } })
    const created = await tx.priceBook.create({
      data: { orgId, name: 'Default', version, isActive: true },
      select: { id: true, version: true },
    })

    let copied = 0
    if (current) {
      const items = await tx.priceBookItem.findMany({ where: { priceBookId: current.id } })
      if (items.length > 0) {
        const result = await tx.priceBookItem.createMany({
          data: items.map((item) => ({
            priceBookId: created.id,
            category: item.category,
            name: item.name,
            unitType: item.unitType,
            retailPrice: item.retailPrice,
            unitCost: item.unitCost,
            customerVisible: item.customerVisible,
            internalOnly: item.internalOnly,
            required: item.required,
            // Copied, not dropped. `upgradeOnly` and `optionKey` were being
            // left behind by this copy, so cutting a new version quietly
            // ungated every heater and salt cell in the book and put the
            // "tick salt, get billed for a heater" defect straight back.
            upgradeOnly: item.upgradeOnly,
            optionKey: item.optionKey,
            ...(item.formula === null ? {} : { formula: item.formula }),
          })),
        })
        copied = result.count
      }
    }

    revalidatePath('/settings/price-book')
    return { ...created, copied }
  })
}
