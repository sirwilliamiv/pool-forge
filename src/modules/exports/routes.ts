// Document routes for the four export commands.
//
// Pure and dependency-free on purpose: the server `execute` returns the URL it
// records on the Export row, and the client handler opens the same URL. One
// definition, so the recorded artifact and the tab the user sees can't drift.

export const EXPORT_COMMAND_IDS = [
  'export.customerProposal',
  'export.constructionPacket',
  'export.sitePlan',
  'export.screenEnclosureQuote',
] as const

export type ExportCommandId = (typeof EXPORT_COMMAND_IDS)[number]

// Optionals accept `undefined` explicitly: under `exactOptionalPropertyTypes`,
// a Zod `.optional()` output is `T | undefined`, and these inputs come straight
// from a parsed command schema.
export interface ExportRouteInput {
  projectId: string
  /** Construction packet only. */
  pageSize?: 'letter' | 'tabloid' | undefined
  /** Screen enclosure RFQ only. */
  showInternalPricing?: boolean | undefined
  /** Screen enclosure RFQ only. */
  showScreenScopeRetail?: boolean | undefined
}

export function isExportCommandId(id: string): id is ExportCommandId {
  return (EXPORT_COMMAND_IDS as readonly string[]).includes(id)
}

export function exportDocumentUrl(id: ExportCommandId, input: ExportRouteInput): string {
  const base = `/projects/${input.projectId}`
  switch (id) {
    case 'export.customerProposal':
      return `${base}/proposal`
    case 'export.constructionPacket':
      return `${base}/construction?size=${input.pageSize ?? 'tabloid'}`
    case 'export.sitePlan':
      return `${base}/site-plan`
    case 'export.screenEnclosureQuote': {
      const params = new URLSearchParams()
      if (input.showInternalPricing) params.set('pricing', '1')
      if (input.showScreenScopeRetail) params.set('subtotal', '1')
      const query = params.toString()
      return query
        ? `${base}/screen-enclosure-quote?${query}`
        : `${base}/screen-enclosure-quote`
    }
  }
}
