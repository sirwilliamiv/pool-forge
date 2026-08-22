import { z } from 'zod'
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

    if (snapshot.items.length === 0) {
      // Named, not generic: "no price book" is something a person can go and fix.
      return { ok: false, error: 'There is no active price book to price against.' }
    }

    const { computeQuote } = await import('@/modules/pricing/engine')
    const { pricingSelectionsFrom } = await import('@/modules/projects/pool-fields')

    // Same function, same inputs as the editor page and the proposal, so the
    // spoken total cannot disagree with the one on screen.
    const quote = computeQuote(
      snapshot.items,
      snapshot.measurements,
      pricingSelectionsFrom(snapshot.poolFields),
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
