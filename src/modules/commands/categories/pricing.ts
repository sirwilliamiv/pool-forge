import { z } from 'zod'
import { PriceCategory, UnitType } from '@prisma/client'
import { register } from '@/modules/commands/registry'

register({
  id: 'add.priceBookItem',
  label: 'Add price book item',
  description: 'Add a new line item to the active price book.',
  category: 'pricing',
  inputSchema: z.object({
    priceBookId: z.string(),
    category: z.string(),
    name: z.string().min(1),
    unitType: z.string().min(1),
    unitCost: z.number().nonnegative().optional(),
    retailPrice: z.number().nonnegative().optional(),
    customerVisible: z.boolean().optional(),
    required: z.boolean().optional(),
  }),
  outputSchema: z.object({
    itemId: z.string(),
  }),
  voiceExamples: [
    'Add a new price book item for salt cell maintenance.',
    'Add an upgrade for LED lighting.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'select.equipment',
  label: 'Select equipment',
  description: 'Choose equipment options (heater, pump, sanitation, lighting, etc.) for the project.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string(),
    selections: z.record(z.string(), z.string()),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    selections: z.record(z.string(), z.string()),
  }),
  voiceExamples: [
    'Add a Pentair salt system.',
    'Use the heat pump heater.',
    'Pick the premium light package.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'generate.quote',
  label: 'Generate quote',
  description:
    'Price the current design against the active price book and report the total. Read-only: it prices what is saved, it does not change anything.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    total: z.number(),
    subtotal: z.number(),
    taxAmount: z.number(),
    lineCount: z.number(),
    /** The handful worth reading aloud, largest first. */
    topLines: z.array(z.object({ name: z.string(), total: z.number() })),
  }),
  voiceExamples: [
    'Price this up.',
    'What does this come to?',
    'How much is this pool?',
    'Give me the total.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const { loadProjectSnapshot } = await import('@/modules/projects/snapshot')
    const snapshot = await loadProjectSnapshot(input.projectId, ctx.orgId)
    if (!snapshot) return { ok: false, error: 'That project is not in this organisation.' }

    if (snapshot.items.length === 0 && snapshot.projectLineItems.length === 0) {
      // Named, not generic: "no price book" is something a person can go and fix.
      return { ok: false, error: 'There is no active price book to price against.' }
    }

    const { computeQuote } = await import('@/modules/pricing/engine')
    const { pricingSelectionsFrom } = await import('@/modules/projects/pool-fields')
    const { resolveFinishes } = await import('@/modules/materials/catalog')

    // Same function, same inputs as the editor page and the proposal, so the
    // spoken total cannot disagree with the one on screen. The finishes are
    // part of "same inputs": leaving them out here would have the agent say a
    // number several thousand dollars below the one on the dock.
    const quote = computeQuote(
      snapshot.items,
      snapshot.measurements,
      {
        ...pricingSelectionsFrom(snapshot.poolFields),
        finishes: resolveFinishes(snapshot.shapes, snapshot.finishCatalog),
        finishItemIds: snapshot.finishCatalog.claimedItemIds,
        // "Same inputs" includes the amounts somebody put on the job by hand.
        // Leaving them out would have the agent read out a total short by a
        // $9,400 retaining wall the dock is showing.
        projectLineItems: snapshot.projectLineItems,
      },
      { taxRatePct: snapshot.taxRatePct },
    )

    const topLines = [...quote.lineItems]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(line => ({ name: line.name, total: line.total }))

    return {
      ok: true,
      data: {
        total: quote.total,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        lineCount: quote.lineItems.length,
        topLines,
      },
    }
  },
})

// ---------------------------------------------------------------------------
// Per-job line items.
//
// Five price categories — lanai, fence, wall, electrical and other — have no
// measurement behind them, so `quantityForItem` answered zero for every item in
// them and `computeQuote` dropped the line. A builder entered "Paver retaining
// wall $9,400", watched it save, saw it listed in the price book, and it was
// absent from every quote and every document. The money was accepted and never
// billed.
//
// These commands are the way that scope gets onto a job: pick a rate out of the
// price book or type a one-off, say how many, and it prices like any other
// line. The registry is the only entry point, so the project page, the palette
// and the voice agent all reach the same code and each write leaves an audit
// row behind it.
// ---------------------------------------------------------------------------

const CATEGORY_VALUES = Object.values(PriceCategory) as [PriceCategory, ...PriceCategory[]]
const UNIT_VALUES = Object.values(UnitType) as [UnitType, ...UnitType[]]

/** What a hand-entered line is worth, as the quote will bill it. */
const LineItemOutput = z.object({
  lineItemId: z.string(),
  name: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  total: z.number(),
})

/**
 * Quantity and price, bounded.
 *
 * Positive rather than non-negative: a line at zero is exactly the silent
 * nothing this whole model exists to stop, so it is refused at the door with a
 * sentence saying why rather than saved and quietly ignored.
 */
const quantityField = z
  .number()
  .finite()
  .positive('A quantity of zero would bill nothing, so give it a real quantity.')
  .max(1_000_000)
const priceField = z.number().finite().nonnegative().max(10_000_000)

async function projectInOrg(projectId: string, orgId: string): Promise<boolean> {
  const { db } = await import('@/lib/db')
  const found = await db.project.findFirst({
    where: { id: projectId, orgId },
    select: { id: true },
  })
  return found !== null
}

/**
 * Refresh the cached total behind the dashboard card.
 *
 * Best-effort: the dock, the proposal and every document compute live, so a
 * failed cache write leaves a stale card rather than a wrong quote. It is still
 * worth doing, because a card reading $70,656 next to a proposal reading
 * $80,056 is the kind of disagreement nobody can reconcile.
 */
async function refreshCachedQuote(projectId: string): Promise<void> {
  try {
    const { recomputeAndCacheEditor } = await import('@/lib/cache/editor')
    await recomputeAndCacheEditor(projectId)
  } catch (err) {
    console.error('[commands] refreshing the cached quote failed', err)
  }
}

register({
  id: 'add.projectLineItem',
  label: 'Add a line item to this job',
  description:
    'Put an amount on one project by hand: a retaining wall, a fence run, a permit fee, a panel upgrade. Nothing in a drawing measures these, so you say what it is, how many, and what it costs.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string().min(1),
    category: z.enum(CATEGORY_VALUES),
    name: z.string().min(1).max(120),
    unitType: z.enum(UNIT_VALUES),
    quantity: quantityField,
    unitPrice: priceField,
    note: z.string().max(500).optional(),
    /** Where the rate came from, when it was copied out of the price book. */
    priceBookItemId: z.string().min(1).optional(),
  }),
  outputSchema: LineItemOutput,
  voiceExamples: [
    'Add a paver retaining wall to this job for nine thousand four hundred dollars.',
    'Put two thousand dollars of permit fees on this project.',
    'Add sixty feet of aluminium fence at forty-two dollars a foot.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    if (!(await projectInOrg(input.projectId, orgId))) {
      return { ok: false, error: 'That project is not in this organisation.' }
    }

    const { db } = await import('@/lib/db')

    // A rate copied out of the price book has to come from this organisation's
    // book. Checked rather than trusted: the id can arrive from a voice call.
    if (input.priceBookItemId !== undefined) {
      const source = await db.priceBookItem.findFirst({
        where: { id: input.priceBookItemId, priceBook: { orgId } },
        select: { id: true },
      })
      if (!source) {
        return { ok: false, error: 'That price book item is not in this organisation.' }
      }
    }

    const name = input.name.trim()
    if (!name) return { ok: false, error: 'A line item needs a name.' }

    const data: {
      projectId: string
      orgId: string
      category: PriceCategory
      name: string
      unitType: UnitType
      quantity: number
      unitPrice: number
      note?: string
      priceBookItemId?: string
    } = {
      projectId: input.projectId,
      orgId,
      category: input.category,
      name,
      unitType: input.unitType,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
    }
    // Assigned one at a time rather than spread: under
    // `exactOptionalPropertyTypes` a spread of `{ note: undefined }` writes the
    // key as undefined, which is not the same as leaving it out.
    const note = input.note?.trim()
    if (note) data.note = note
    if (input.priceBookItemId !== undefined) data.priceBookItemId = input.priceBookItemId

    const row = await db.projectLineItem.create({ data, select: { id: true } })
    await refreshCachedQuote(input.projectId)

    return {
      ok: true,
      data: {
        lineItemId: row.id,
        name,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        total: Math.round(input.quantity * input.unitPrice * 100) / 100,
      },
    }
  },
})

register({
  id: 'update.projectLineItem',
  label: 'Change a line item on this job',
  description: 'Change the name, quantity, price or note of an amount already added to this job.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string().min(1),
    lineItemId: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    category: z.enum(CATEGORY_VALUES).optional(),
    unitType: z.enum(UNIT_VALUES).optional(),
    quantity: quantityField.optional(),
    unitPrice: priceField.optional(),
    note: z.string().max(500).nullable().optional(),
  }),
  outputSchema: LineItemOutput,
  voiceExamples: [
    'Change the retaining wall to eleven thousand dollars.',
    'Make the permit fee twenty-five hundred.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')
    const existing = await db.projectLineItem.findFirst({
      where: { id: input.lineItemId, projectId: input.projectId, orgId },
      select: { id: true, name: true, quantity: true, unitPrice: true },
    })
    if (!existing) return { ok: false, error: 'That line item is not on this project.' }

    const patch: {
      name?: string
      category?: PriceCategory
      unitType?: UnitType
      quantity?: number
      unitPrice?: number
      note?: string | null
    } = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) return { ok: false, error: 'A line item needs a name.' }
      patch.name = name
    }
    if (input.category !== undefined) patch.category = input.category
    if (input.unitType !== undefined) patch.unitType = input.unitType
    if (input.quantity !== undefined) patch.quantity = input.quantity
    if (input.unitPrice !== undefined) patch.unitPrice = input.unitPrice
    if (input.note !== undefined) patch.note = input.note === null ? null : input.note.trim() || null

    const row = await db.projectLineItem.update({
      where: { id: existing.id },
      data: patch,
      select: { id: true, name: true, quantity: true, unitPrice: true },
    })
    await refreshCachedQuote(input.projectId)

    const quantity = Number(row.quantity)
    const unitPrice = Number(row.unitPrice)
    return {
      ok: true,
      data: {
        lineItemId: row.id,
        name: row.name,
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
      },
    }
  },
})

register({
  id: 'remove.projectLineItem',
  label: 'Remove a line item from this job',
  description: 'Take a hand-entered amount back off this project. It stops billing immediately.',
  category: 'pricing',
  inputSchema: z.object({
    projectId: z.string().min(1),
    lineItemId: z.string().min(1),
  }),
  outputSchema: z.object({ lineItemId: z.string(), name: z.string() }),
  voiceExamples: ['Take the retaining wall off this job.', 'Remove the permit fee.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')
    const existing = await db.projectLineItem.findFirst({
      where: { id: input.lineItemId, projectId: input.projectId, orgId },
      select: { id: true, name: true },
    })
    if (!existing) return { ok: false, error: 'That line item is not on this project.' }

    await db.projectLineItem.delete({ where: { id: existing.id } })
    await refreshCachedQuote(input.projectId)

    return { ok: true, data: { lineItemId: existing.id, name: existing.name } }
  },
})
