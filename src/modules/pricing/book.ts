// Which price book is active for an organisation, and cutting a new version.
//
// Pulled out of `settings/price-book/actions.ts` rather than left there: that
// file carries `'use server'` and imports `@/lib/auth`, which pulls in
// next-auth's runtime and breaks under plain Node (the integration tests, the
// command registry's `execute` functions). Nothing here needs a session:
// a command's `execute` already has `ctx.orgId`, so this module takes the org
// id as a plain argument and stays free of anything Next-specific.

import { db } from '@/lib/db'

/** The active price book for this organisation, creating the starter "Default" book if none exists yet. */
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
export async function createBookVersionForOrg(
  orgId: string,
): Promise<{ id: string; version: number; copied: number }> {
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

    return { ...created, copied }
  })
}
