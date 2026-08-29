'use server'

import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { toPriceBookItems, type PriceBookItemLite } from './engine'

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

  return toPriceBookItems(book.items)
}
