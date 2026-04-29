'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PriceCategory, UnitType } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { getOrCreateActiveBookId } from '../actions'

const ImportItemSchema = z.object({
  category: z.nativeEnum(PriceCategory),
  name: z.string().min(1),
  unitType: z.nativeEnum(UnitType),
  retailPrice: z.number().min(0),
  unitCost: z.number().min(0).optional(),
  customerVisible: z.boolean().optional(),
})

const ImportArraySchema = z.array(ImportItemSchema).min(1).max(5000)

export async function importPriceBookItems(
  rawItems: unknown,
): Promise<{ created: number }> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) throw new Error('Not authenticated')

  const items = ImportArraySchema.parse(rawItems)
  const priceBookId = await getOrCreateActiveBookId(orgId)

  const result = await db.priceBookItem.createMany({
    data: items.map((it) => ({
      priceBookId,
      category: it.category,
      name: it.name,
      unitType: it.unitType,
      retailPrice: it.retailPrice,
      unitCost: it.unitCost ?? 0,
      customerVisible: it.customerVisible ?? true,
      internalOnly: false,
      required: false,
      upgradeOnly: false,
    })),
  })

  revalidatePath('/settings/price-book')
  return { created: result.count }
}
