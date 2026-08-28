// Which document is being stored, and under which name.
//
// `ExportKind` also carries `IMAGE`, which is not a document this app renders,
// so the four renderable kinds are named here rather than derived from the
// enum. A fifth kind cannot be added without this file gaining a title and a
// filename for it.

import { ExportKind } from '@prisma/client'
import { z } from 'zod'

import type { ExportCommandId } from '@/modules/exports/routes'

export const DOCUMENT_KINDS = [
  ExportKind.CUSTOMER_PROPOSAL,
  ExportKind.CONSTRUCTION_PACKET,
  ExportKind.SITE_PLAN,
  ExportKind.SCREEN_ENCLOSURE_QUOTE,
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

export function isDocumentKind(value: ExportKind): value is DocumentKind {
  return (DOCUMENT_KINDS as readonly ExportKind[]).includes(value)
}

/**
 * Render options.
 *
 * Every field is optional and every field accepts `undefined` explicitly:
 * `exactOptionalPropertyTypes` is on, and these values arrive from a parsed
 * command schema where an absent key and an explicit `undefined` are the same
 * thing to the caller. Each option belongs to exactly one kind and is ignored
 * by the other three.
 */
export const documentOptionsSchema = z.object({
  /** Construction packet only. */
  pageSize: z.enum(['letter', 'tabloid']).optional(),
  /** Screen enclosure RFQ only. */
  showInternalPricing: z.boolean().optional(),
  /** Screen enclosure RFQ only. */
  showScreenScopeRetail: z.boolean().optional(),
})

export type DocumentOptions = z.infer<typeof documentOptionsSchema>

export const KIND_BY_COMMAND: Record<ExportCommandId, DocumentKind> = {
  'export.customerProposal': ExportKind.CUSTOMER_PROPOSAL,
  'export.constructionPacket': ExportKind.CONSTRUCTION_PACKET,
  'export.sitePlan': ExportKind.SITE_PLAN,
  'export.screenEnclosureQuote': ExportKind.SCREEN_ENCLOSURE_QUOTE,
}

const KIND_LABELS: Record<DocumentKind, string> = {
  [ExportKind.CUSTOMER_PROPOSAL]: 'Proposal',
  [ExportKind.CONSTRUCTION_PACKET]: 'Construction packet',
  [ExportKind.SITE_PLAN]: 'Site plan',
  [ExportKind.SCREEN_ENCLOSURE_QUOTE]: 'Screen enclosure RFQ',
}

export function documentKindLabel(kind: DocumentKind): string {
  return KIND_LABELS[kind]
}

const KIND_SLUGS: Record<DocumentKind, string> = {
  [ExportKind.CUSTOMER_PROPOSAL]: 'proposal',
  [ExportKind.CONSTRUCTION_PACKET]: 'construction-packet',
  [ExportKind.SITE_PLAN]: 'site-plan',
  [ExportKind.SCREEN_ENCLOSURE_QUOTE]: 'screen-enclosure-rfq',
}

/**
 * A filename a builder can find again in a downloads folder six months later.
 *
 * The job number when there is one, because that is the number said on the
 * phone; the row id otherwise, because two proposals for two unnumbered
 * projects must not collide.
 */
export function documentFilename(args: {
  kind: DocumentKind
  jobNumber: number | null
  exportId: string
  generatedAt: Date
}): string {
  const reference = args.jobNumber !== null ? String(args.jobNumber) : args.exportId.slice(-8)
  const day = args.generatedAt.toISOString().slice(0, 10)
  return `${KIND_SLUGS[args.kind]}-${reference}-${day}.html`
}
