import { ExportKind } from '@prisma/client'
import { z } from 'zod'
import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import {
  exportDocumentUrl,
  type ExportCommandId,
  type ExportRouteInput,
} from '@/modules/exports/routes'
import type { DocumentKind, DocumentOptions } from '@/modules/exports/document/kinds'

// CLIENT: each export command has a handler in
// `components/exports/ExportCommandHandlers.tsx` that opens the returned URL in
// a new tab. The server half verifies org scope, renders the document, stores
// the bytes, and records the `Export` row.
//
// The row used to carry a URL and a timestamp, which answered "somebody
// exported something" and nothing else. A route re-renders from today's data,
// so a row pointing at one was a receipt for a document that no longer existed.
// The command now produces the artifact: the bytes go to the blob store and the
// row carries the key, the sha256 and the length. That is what makes "what did
// we send the Alvarezes in March" answerable.

const exportOutput = z.object({
  exportId: z.string(),
  url: z.string(),
  /** Blob address of the stored copy. */
  storageKey: z.string(),
  /** sha256 of the stored bytes: the document's identity. */
  contentHash: z.string(),
  byteSize: z.number().int().nonnegative(),
})

type ExportOutput = z.infer<typeof exportOutput>

/**
 * Only the options this kind actually reads.
 *
 * Built field by field rather than spread: `exactOptionalPropertyTypes` is on,
 * and spreading an absent option would write the key as `undefined`.
 */
function optionsFor(commandId: ExportCommandId, input: ExportRouteInput): DocumentOptions {
  const options: DocumentOptions = {}
  if (commandId === 'export.constructionPacket' && input.pageSize !== undefined) {
    options.pageSize = input.pageSize
  }
  if (commandId === 'export.screenEnclosureQuote') {
    if (input.showInternalPricing !== undefined) {
      options.showInternalPricing = input.showInternalPricing
    }
    if (input.showScreenScopeRetail !== undefined) {
      options.showScreenScopeRetail = input.showScreenScopeRetail
    }
  }
  return options
}

// The document modules are imported lazily so the registry stays loadable in
// the jsdom unit tests, which import every category to assert the catalog.
async function recordExport(
  commandId: ExportCommandId,
  kind: DocumentKind,
  input: ExportRouteInput,
  ctx: CommandContext,
): Promise<CommandResult<ExportOutput>> {
  const url = exportDocumentUrl(commandId, input)

  if (ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

  const { storeExportDocument } = await import('@/modules/exports/document/store')
  const stored = await storeExportDocument({
    projectId: input.projectId,
    orgId: ctx.orgId,
    kind,
    url,
    generatedById: ctx.userId === 'anonymous' ? null : ctx.userId,
    options: optionsFor(commandId, input),
  })
  if (!stored.ok) return { ok: false, error: stored.error }

  return {
    ok: true,
    data: {
      exportId: stored.data.exportId,
      url,
      storageKey: stored.data.storageKey,
      contentHash: stored.data.contentHash,
      byteSize: stored.data.byteSize,
    },
  }
}

register({
  id: 'export.customerProposal',
  label: 'Export customer proposal',
  description: 'Render the customer-facing proposal PDF for the project.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string().min(1),
  }),
  outputSchema: exportOutput,
  voiceExamples: [
    'Export the customer proposal.',
    'Generate the proposal PDF.',
  ],
  execute: (input, ctx) =>
    recordExport('export.customerProposal', ExportKind.CUSTOMER_PROPOSAL, input, ctx),
})

register({
  id: 'export.constructionPacket',
  label: 'Export construction packet',
  description:
    'Render the construction-facing packet PDF with detailed measurements and specs. Defaults to 11×17 (Tabloid).',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string().min(1),
    // Default Tabloid (11×17) — Jimmy prints 10 copies for site use.
    // Letter is opt-in for offices without a 17" printer.
    pageSize: z.enum(['letter', 'tabloid']).optional().default('tabloid'),
  }),
  outputSchema: exportOutput,
  voiceExamples: [
    'Export the construction packet.',
    'Generate the construction PDF.',
    'Print the construction packet on letter paper.',
  ],
  execute: (input, ctx) =>
    recordExport('export.constructionPacket', ExportKind.CONSTRUCTION_PACKET, input, ctx),
})

register({
  id: 'export.sitePlan',
  label: 'Export site plan',
  description:
    'Render the site plan PDF for permit submission — title block, survey overlay, setbacks, and signature blocks.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string().min(1),
  }),
  outputSchema: exportOutput,
  voiceExamples: [
    'Export the site plan.',
    'Generate the permit site plan.',
  ],
  execute: (input, ctx) => recordExport('export.sitePlan', ExportKind.SITE_PLAN, input, ctx),
})

register({
  id: 'export.screenEnclosureQuote',
  label: 'Export screen enclosure RFQ',
  description:
    'Render a request-for-quote document for the screen enclosure subcontractor. Hides pricing by default.',
  category: 'export',
  inputSchema: z.object({
    projectId: z.string().min(1),
    // Defaults: hide all pricing — this is an RFQ to a sub.
    showInternalPricing: z.boolean().optional().default(false),
    showScreenScopeRetail: z.boolean().optional().default(false),
  }),
  outputSchema: exportOutput,
  voiceExamples: [
    'Export the screen enclosure quote.',
    'Generate the screen RFQ.',
    'Send the screen enclosure quote with retail subtotal visible.',
  ],
  execute: (input, ctx) =>
    recordExport('export.screenEnclosureQuote', ExportKind.SCREEN_ENCLOSURE_QUOTE, input, ctx),
})
