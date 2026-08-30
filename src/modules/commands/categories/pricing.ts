import { z } from 'zod'
import { PriceCategory, UnitType } from '@prisma/client'
import { register } from '@/modules/commands/registry'
import { PRICING_OPTIONS } from '@/modules/pricing/engine'

const CATEGORY_VALUES = Object.values(PriceCategory) as [PriceCategory, ...PriceCategory[]]
const UNIT_VALUES = Object.values(UnitType) as [UnitType, ...UnitType[]]

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
// Price book CRUD.
//
// These used to be direct Prisma calls in `settings/price-book/actions.ts`
// with no audit row and no way for voice to reach them: a builder could price
// a job but had to open the settings screen to touch a price. The registry is
// the only entry point now, so the price book dialog, the row's delete button
// and the voice agent all write through the same code and each edit leaves a
// `CommandAuditLog` row.
// ---------------------------------------------------------------------------

/**
 * Which customer selection turns a line on, or null for "billed by its
 * category rule". Constrained to the options the app actually asks about, the
 * same way the dialog it replaces was.
 */
const OptionKeyField = z.enum(PRICING_OPTIONS).nullable()

register({
  id: 'pricebook.item.add',
  label: 'Add price book item',
  description: 'Add a new line item to the organisation\'s active price book.',
  category: 'pricing',
  inputSchema: z.object({
    category: z.enum(CATEGORY_VALUES),
    name: z.string().min(1).max(120),
    unitType: z.enum(UNIT_VALUES),
    retailPrice: z.number().nonnegative(),
    unitCost: z.number().nonnegative().optional(),
    customerVisible: z.boolean().optional(),
    internalOnly: z.boolean().optional(),
    required: z.boolean().optional(),
    upgradeOnly: z.boolean().optional(),
    optionKey: OptionKeyField.optional(),
  }),
  outputSchema: z.object({ itemId: z.string() }),
  voiceExamples: [
    'Add a price book item: pool light, 450 each.',
    'Put excavation in the price book at 4500 per job.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const name = input.name.trim()
    if (!name) return { ok: false, error: 'A price book item needs a name.' }

    const { db } = await import('@/lib/db')
    const { getOrCreateActiveBookId } = await import('@/modules/pricing/book')
    const priceBookId = await getOrCreateActiveBookId(orgId)

    const row = await db.priceBookItem.create({
      data: {
        priceBookId,
        category: input.category,
        name,
        unitType: input.unitType,
        retailPrice: input.retailPrice,
        unitCost: input.unitCost ?? 0,
        customerVisible: input.customerVisible ?? true,
        internalOnly: input.internalOnly ?? false,
        required: input.required ?? false,
        upgradeOnly: input.upgradeOnly ?? false,
        optionKey: input.optionKey ?? null,
      },
      select: { id: true },
    })

    return { ok: true, data: { itemId: row.id } }
  },
})

register({
  id: 'pricebook.item.update',
  label: 'Update price book item',
  description: 'Change one or more fields of an existing price book item.',
  category: 'pricing',
  inputSchema: z.object({
    itemId: z.string().min(1),
    category: z.enum(CATEGORY_VALUES).optional(),
    name: z.string().min(1).max(120).optional(),
    unitType: z.enum(UNIT_VALUES).optional(),
    retailPrice: z.number().nonnegative().optional(),
    unitCost: z.number().nonnegative().optional(),
    customerVisible: z.boolean().optional(),
    internalOnly: z.boolean().optional(),
    required: z.boolean().optional(),
    upgradeOnly: z.boolean().optional(),
    optionKey: OptionKeyField.optional(),
  }),
  outputSchema: z.object({ itemId: z.string() }),
  voiceExamples: [
    'Change the pool light price to 500.',
    'Set the unit cost on excavation to 3800.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')
    const existing = await db.priceBookItem.findFirst({
      where: { id: input.itemId, priceBook: { orgId } },
      select: { id: true },
    })
    if (!existing) return { ok: false, error: 'That price book item is not in this organisation.' }

    const patch: {
      category?: PriceCategory
      name?: string
      unitType?: UnitType
      retailPrice?: number
      unitCost?: number
      customerVisible?: boolean
      internalOnly?: boolean
      required?: boolean
      upgradeOnly?: boolean
      optionKey?: string | null
    } = {}
    if (input.category !== undefined) patch.category = input.category
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) return { ok: false, error: 'A price book item needs a name.' }
      patch.name = name
    }
    if (input.unitType !== undefined) patch.unitType = input.unitType
    if (input.retailPrice !== undefined) patch.retailPrice = input.retailPrice
    if (input.unitCost !== undefined) patch.unitCost = input.unitCost
    if (input.customerVisible !== undefined) patch.customerVisible = input.customerVisible
    if (input.internalOnly !== undefined) patch.internalOnly = input.internalOnly
    if (input.required !== undefined) patch.required = input.required
    if (input.upgradeOnly !== undefined) patch.upgradeOnly = input.upgradeOnly
    // Explicit null is a real edit here ("stop gating this line"), so the
    // check is against undefined rather than a truthiness test.
    if (input.optionKey !== undefined) patch.optionKey = input.optionKey

    // itemId with nothing else is not an update: it would write an empty
    // patch, log a success audit row, and have Marco report a change that
    // never happened. Caught here rather than left to Prisma's happy no-op.
    if (Object.keys(patch).length === 0) {
      return { ok: false, error: 'Nothing to update: say which field to change.' }
    }

    await db.priceBookItem.updateMany({
      where: { id: existing.id, priceBook: { orgId } },
      data: patch,
    })

    return { ok: true, data: { itemId: existing.id } }
  },
})

register({
  id: 'pricebook.item.remove',
  label: 'Remove price book item',
  description: 'Delete a line item from the price book. Cannot be undone.',
  category: 'pricing',
  inputSchema: z.object({ itemId: z.string().min(1) }),
  outputSchema: z.object({ itemId: z.string(), name: z.string() }),
  voiceExamples: ['Remove the old heater line from the price book.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')
    const existing = await db.priceBookItem.findFirst({
      where: { id: input.itemId, priceBook: { orgId } },
      select: { id: true, name: true },
    })
    if (!existing) return { ok: false, error: 'That price book item is not in this organisation.' }

    await db.priceBookItem.deleteMany({ where: { id: existing.id, priceBook: { orgId } } })

    return { ok: true, data: { itemId: existing.id, name: existing.name } }
  },
})

register({
  id: 'pricebook.describe',
  label: 'Describe price book coverage',
  description:
    'Report what the active price book covers: how many items it has, how many still carry the starting placeholder price, and which categories a drawing can produce that have no line or never bill. Read-only.',
  category: 'pricing',
  inputSchema: z.object({}),
  outputSchema: z.object({
    bookName: z.string(),
    version: z.number(),
    itemCount: z.number(),
    placeholderCount: z.number(),
    missingCategories: z.array(z.string()),
    neverBills: z.array(z.string()),
  }),
  voiceExamples: ['What is missing from my price book?', 'How many prices have I set up?'],
  execute: async (_input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')
    const book = await db.priceBook.findFirst({
      where: { orgId, isActive: true },
      orderBy: { version: 'desc' },
      include: { items: true },
    })

    const items = (book?.items ?? []).map(it => ({
      category: it.category,
      name: it.name,
      unitType: it.unitType,
      unitCost: Number(it.unitCost),
      retailPrice: Number(it.retailPrice),
    }))

    // Same computation the price book page's coverage panel runs, over the
    // same stencil mapping, so a hole reported here is exactly the hole a
    // quote would refuse to price.
    const { priceBookCoverage } = await import('@/modules/onboarding/coverage')
    const { unchangedStarterLines } = await import('@/modules/onboarding/starter-price-book')

    const coverage = priceBookCoverage(items)
    const placeholderCount = unchangedStarterLines(items).length
    const missingCategories = coverage.filter(row => row.status === 'MISSING').map(row => row.label)
    const neverBills = coverage
      .filter(row => row.status === 'UNIT_UNMEASURED')
      .map(row => row.label)

    return {
      ok: true,
      data: {
        bookName: book?.name ?? 'No active book',
        version: book?.version ?? 0,
        itemCount: items.length,
        placeholderCount,
        missingCategories,
        neverBills,
      },
    }
  },
})

register({
  id: 'pricebook.import.replace',
  label: 'Replace the price book from an import',
  description:
    'Publish an XLSX-derived list as a new version of the price book, replacing its contents. The version this replaces is kept. Bulk, file-driven and destructive: auditable, not spoken.',
  category: 'pricing',
  inputSchema: z.object({
    items: z
      .array(
        z.object({
          category: z.enum(CATEGORY_VALUES),
          name: z.string().min(1),
          unitType: z.enum(UNIT_VALUES),
          retailPrice: z.number().nonnegative(),
          unitCost: z.number().nonnegative().optional(),
          customerVisible: z.boolean().optional(),
        }),
      )
      .min(1)
      .max(5000),
  }),
  outputSchema: z.object({ created: z.number(), version: z.number(), replaced: z.number() }),
  // No voiceExamples: the converter refuses a command without them, so this
  // never reaches the voice agent. A misheard "replace the price book" would
  // wipe every rate in it.
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')
    const { createBookVersionForOrg } = await import('@/modules/pricing/book')

    // A fresh version, then empty it: the copy is what keeps the previous
    // version intact, and the emptying is what stops the import stacking on
    // top of it.
    const version = await createBookVersionForOrg(orgId)
    const priceBookId = version.id
    const cleared = await db.priceBookItem.deleteMany({ where: { priceBookId } })

    const result = await db.priceBookItem.createMany({
      data: input.items.map(it => ({
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

    return {
      ok: true,
      data: { created: result.count, version: version.version, replaced: cleared.count },
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
