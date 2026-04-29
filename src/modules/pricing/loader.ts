'use server'

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import type { PriceBookItemLite } from './engine'

export async function loadActivePriceBookItems(): Promise<PriceBookItemLite[]> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) return []

  const book = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    include: { items: true },
  })
  if (!book) return []

  return book.items.map((i) => ({
    id: i.id,
    category: i.category,
    name: i.name,
    unitType: i.unitType,
    retailPrice: Number(i.retailPrice),
  }))
}
