'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { PriceCategory, UnitType } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { createBookVersion } from '../actions'
import type { ImportRow } from '@/modules/pricing/import'

/**
 * Ask the model which columns of an uploaded price sheet are which, and hand
 * back a mapping the form can pre-fill.
 *
 * The heavy lifting (the prompt, the refusal of any column the model invents,
 * the reduction to our schema) lives in `pricing/ai-import`; this action only
 * builds the Vertex-backed client and gates on a session. It never returns
 * prices or values — only column names — because the model is never asked for
 * anything else. The customer's sheet goes only to Vertex, never the consumer
 * Gemini endpoint.
 */
const previewSchema = z.object({
  headers: z.array(z.string()).min(1).max(200),
  rows: z.array(z.record(z.string(), z.unknown())).max(5000),
})

export async function autoDetectMapping(rawPreview: unknown): Promise<
  | { ok: true; detected: Partial<Record<keyof ImportRow, string>>; notes: string[] }
  | { ok: false; error: string }
> {
  const session = await auth()
  if (!session?.user?.orgId) return { ok: false, error: 'Not authenticated' }

  const parsed = previewSchema.safeParse(rawPreview)
  if (!parsed.success) return { ok: false, error: 'That sheet could not be read.' }

  const { createVisionClient } = await import('@/modules/imports/vision/client')
  const { inferMapping, toDetectedMapping } = await import('@/modules/pricing/ai-import')

  try {
    const client = createVisionClient()
    const outcome = await inferMapping(client, parsed.data)
    return {
      ok: true,
      detected: toDetectedMapping(outcome.mapping),
      notes: outcome.mapping.notes,
    }
  } catch (err) {
    // Never surface the model's or the client's raw message; it can quote the
    // sheet or carry a key fragment. The module's own error is a sentence.
    return {
      ok: false,
      error:
        err instanceof Error && err.message
          ? err.message
          : 'The price list could not be read. Map the columns by hand.',
    }
  }
}

const ImportItemSchema = z.object({
  category: z.nativeEnum(PriceCategory),
  name: z.string().min(1),
  unitType: z.nativeEnum(UnitType),
  retailPrice: z.number().min(0),
  unitCost: z.number().min(0).optional(),
  customerVisible: z.boolean().optional(),
})

const ImportArraySchema = z.array(ImportItemSchema).min(1).max(5000)

/**
 * Load a price list as a new version of the book.
 *
 * It used to append into whichever book was active, so importing a supplier's
 * updated list a second time left every item in there twice. Two of every deck
 * line, and a quote engine that bills each item in a category, is a doubled
 * job on a customer's proposal.
 *
 * A version instead: the incoming list replaces the contents rather than piling
 * on top, and the book it replaced stays readable. An import that turns out to
 * be the wrong file is then a thing you can back out of, which is the whole
 * reason a builder would risk pressing the button at all.
 */
export async function importPriceBookItems(
  rawItems: unknown,
): Promise<{ created: number; version: number; replaced: number }> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) throw new Error('Not authenticated')

  const items = ImportArraySchema.parse(rawItems)

  // A fresh version, then empty it: the copy is what keeps the previous version
  // intact, and the emptying is what stops the import stacking on top of it.
  const version = await createBookVersion()
  const priceBookId = version.id
  const cleared = await db.priceBookItem.deleteMany({ where: { priceBookId } })

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
  return { created: result.count, version: version.version, replaced: cleared.count }
}
