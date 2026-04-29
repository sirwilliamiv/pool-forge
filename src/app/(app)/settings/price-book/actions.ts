'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PriceCategory, UnitType } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

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

export async function createBookVersion(): Promise<{ id: string; version: number }> {
  const orgId = await requireOrgId()
  const latest = await db.priceBook.findFirst({
    where: { orgId, name: 'Default' },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const version = (latest?.version ?? 0) + 1

  await db.priceBook.updateMany({ where: { orgId, isActive: true }, data: { isActive: false } })
  const created = await db.priceBook.create({
    data: { orgId, name: 'Default', version, isActive: true },
    select: { id: true, version: true },
  })

  revalidatePath('/settings/price-book')
  return created
}
