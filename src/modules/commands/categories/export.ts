import { z } from 'zod'
import { register } from '@/modules/commands/registry'

register({
  id: 'export.customerProposal',
  label: 'Export customer proposal',
  description: 'Render the customer-facing proposal PDF for the project.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    exportId: z.string(),
    url: z.string(),
  }),
  voiceExamples: [
    'Export the customer proposal.',
    'Generate the proposal PDF.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'export.constructionPacket',
  label: 'Export construction packet',
  description:
    'Render the construction-facing packet PDF with detailed measurements and specs. Defaults to 11×17 (Tabloid).',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string(),
    // Default Tabloid (11×17) — Jimmy prints 10 copies for site use.
    // Letter is opt-in for offices without a 17" printer.
    pageSize: z.enum(['letter', 'tabloid']).optional().default('tabloid'),
  }),
  outputSchema: z.object({
    exportId: z.string(),
    url: z.string(),
  }),
  voiceExamples: [
    'Export the construction packet.',
    'Generate the construction PDF.',
    'Print the construction packet on letter paper.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'export.sitePlan',
  label: 'Export site plan',
  description:
    'Render the site plan PDF for permit submission — title block, survey overlay, setbacks, and signature blocks.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    exportId: z.string(),
    url: z.string(),
  }),
  voiceExamples: [
    'Export the site plan.',
    'Generate the permit site plan.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'export.screenEnclosureQuote',
  label: 'Export screen enclosure RFQ',
  description:
    'Render a request-for-quote document for the screen enclosure subcontractor. Hides pricing by default.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string(),
    // Defaults: hide all pricing — this is an RFQ to a sub.
    showInternalPricing: z.boolean().optional().default(false),
    showScreenScopeRetail: z.boolean().optional().default(false),
  }),
  outputSchema: z.object({
    exportId: z.string(),
    url: z.string(),
  }),
  voiceExamples: [
    'Export the screen enclosure quote.',
    'Generate the screen RFQ.',
    'Send the screen enclosure quote with retail subtotal visible.',
  ],
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
