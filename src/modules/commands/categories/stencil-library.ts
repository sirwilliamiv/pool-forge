import { OrgStencilSource, StencilImportStatus, type Prisma } from '@prisma/client'
import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import { logIngestFailure } from '@/modules/imports/ingest/errors'
import { takeStagedUpload } from '@/modules/imports/ingest/staging'
import {
  ConverterFailedError,
  ConverterMissingError,
  getStencilConverter,
} from '@/modules/imports/visio/convert'
import { scaleRings } from '@/modules/imports/visio/scale'
import { sniffVisio } from '@/modules/imports/visio/sniff'
import {
  CandidateSchema,
  CommitInputSchema,
  CommitOutputSchema,
  DeleteInputSchema,
  DeleteOutputSchema,
  LibraryCommand,
  ListOutputSchema,
  OrgStencilSummarySchema,
  PlaceInputSchema,
  PlaceOutputSchema,
  PlaceableShapeKindSchema,
  PreviewInputSchema,
  PreviewOutputSchema,
  RingSchema,
  STENCIL_IMPORT_TTL_MS,
  StoredCandidateSchema,
  VISIO_SCALE_DEFAULT,
  VisioMessage,
  type CommitItem,
  type CommitOutput,
  type ConversionResult,
  type DeleteOutput,
  type ListOutput,
  type OrgStencilSummary,
  type PlaceOutput,
  type PreviewOutput,
  type Ring,
  type StoredCandidate,
} from '@/modules/imports/visio/types'

// The builder's own stencil library: Visio masters imported into org-scoped
// `OrgStencil` rows, listed in the Stencils panel and dropped onto the canvas.
//
// The upload route stages the file and dispatches `preview`; everything that
// reads or writes the library goes through one of these five commands.
//
// `db` is imported lazily so the registry stays loadable in the jsdom unit tests
// that import every category to assert the catalog.

const ANONYMOUS = 'anonymous'

/** Placeholder id the server returns; the client handler creates the real shape. */
const CLIENT_PENDING_SHAPE_ID = 'client-pending'


const LibraryError = {
  NOT_AUTHENTICATED: 'Not authenticated',
  UNKNOWN_INDEX: 'That stencil is not in this import.',
  duplicateName: (name: string) => `Two stencils are both called "${name}". Give one a different name.`,
} as const

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: LibraryError.NOT_AUTHENTICATED }
  return null
}

/** Attribute only to a user that exists; `createdBy` is a foreign key. */
async function authorId(userId: string): Promise<string | null> {
  if (!userId || userId === ANONYMOUS) return null
  const { db } = await import('@/lib/db')
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true } })
  return user?.id ?? null
}


const summarySelect = {
  id: true,
  name: true,
  category: true,
  shapeKind: true,
  widthIn: true,
  heightIn: true,
  thumbnailSvg: true,
  fill: true,
  stroke: true,
  sourceFile: true,
  updatedAt: true,
} as const satisfies Prisma.OrgStencilSelect

type SummaryRow = Prisma.OrgStencilGetPayload<{ select: typeof summarySelect }>

function toSummary(row: SummaryRow): OrgStencilSummary {
  return OrgStencilSummarySchema.parse({ ...row, updatedAt: row.updatedAt.toISOString() })
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

/** Thrown inside the commit transaction to roll it back with a readable answer. */
class CommitRefused extends Error {}

register({
  id: LibraryCommand.PREVIEW,
  label: 'Preview a stencil file',
  description:
    'Read an uploaded Visio stencil file and list the stencils it contains, ready to review before they join the library.',
  category: 'template',
  inputSchema: PreviewInputSchema,
  outputSchema: PreviewOutputSchema,
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<PreviewOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const staged = takeStagedUpload(input.uploadRef, ctx.orgId)
    if (!staged) return { ok: false, error: VisioMessage.EXPIRED }
    if (sniffVisio(staged.bytes) === null) return { ok: false, error: VisioMessage.NOT_A_STENCIL }

    let conversion: ConversionResult
    try {
      conversion = await getStencilConverter()(staged.bytes, input.fileName)
    } catch (err) {
      if (err instanceof ConverterMissingError) return { ok: false, error: VisioMessage.CONVERTER_MISSING }
      if (err instanceof ConverterFailedError) return { ok: false, error: err.message }
      const ref = logIngestFailure(LibraryCommand.PREVIEW, err)
      return { ok: false, error: `${VisioMessage.CONVERT_FAILED} (ref ${ref}).` }
    }
    if (conversion.candidates.length === 0) return { ok: false, error: VisioMessage.NO_MASTERS }

    const scaleInchesPerInch = input.scaleInchesPerInch ?? VISIO_SCALE_DEFAULT
    const { db } = await import('@/lib/db')
    const row = await db.stencilImport.create({
      data: {
        orgId: ctx.orgId,
        fileName: input.fileName,
        scaleInchesPerInch,
        candidatesJson: asJson(conversion.candidates),
        skippedJson: asJson(conversion.skipped),
        createdBy: await authorId(ctx.userId),
        expiresAt: new Date(Date.now() + STENCIL_IMPORT_TTL_MS),
      },
      select: { id: true },
    })

    return {
      ok: true,
      data: {
        importId: row.id,
        fileName: input.fileName,
        scaleInchesPerInch,
        candidates: conversion.candidates.map(c => CandidateSchema.parse(c)),
        skipped: conversion.skipped,
      },
    }
  },
})

register({
  id: LibraryCommand.COMMIT,
  label: 'Add stencils to my library',
  description:
    'Add the reviewed stencils from a previewed file to this organization\'s library at the chosen scale, replacing any of the same name.',
  category: 'template',
  inputSchema: CommitInputSchema,
  outputSchema: CommitOutputSchema,
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<CommitOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const pending = await db.stencilImport.findFirst({
      where: { id: input.importId, orgId: ctx.orgId },
      select: { id: true, fileName: true, status: true, expiresAt: true, candidatesJson: true },
    })
    if (!pending || pending.expiresAt.getTime() <= Date.now()) return { ok: false, error: VisioMessage.EXPIRED }
    if (pending.status === StencilImportStatus.COMMITTED) return { ok: false, error: VisioMessage.ALREADY_COMMITTED }
    if (pending.status !== StencilImportStatus.PENDING) return { ok: false, error: VisioMessage.EXPIRED }

    const included: CommitItem[] = input.items
      .filter(item => item.include)
      .map(item => ({ ...item, name: item.name.trim() }))
    if (included.length === 0) return { ok: false, error: VisioMessage.NOTHING_SELECTED }

    const seen = new Set<string>()
    for (const item of included) {
      if (seen.has(item.name)) return { ok: false, error: LibraryError.duplicateName(item.name) }
      seen.add(item.name)
    }

    const stored = z.array(StoredCandidateSchema).safeParse(pending.candidatesJson)
    if (!stored.success) return { ok: false, error: VisioMessage.EXPIRED }
    const byIndex = new Map<number, StoredCandidate>(stored.data.map(c => [c.index, c]))
    const plan: { item: CommitItem; candidate: StoredCandidate }[] = []
    for (const item of included) {
      const candidate = byIndex.get(item.index)
      if (!candidate) return { ok: false, error: LibraryError.UNKNOWN_INDEX }
      plan.push({ item, candidate })
    }

    const existing = await db.orgStencil.findMany({
      where: { orgId: ctx.orgId, name: { in: [...seen] } },
      select: { name: true },
    })
    const replacing = new Set(existing.map(row => row.name))
    const createdBy = await authorId(ctx.userId)

    let rows: SummaryRow[]
    try {
      rows = await db.$transaction(async tx => {
        // Claim the import first: a second commit racing this one finds it no
        // longer pending and rolls back without writing a stencil.
        const claimed = await tx.stencilImport.updateMany({
          where: { id: pending.id, orgId: ctx.orgId, status: StencilImportStatus.PENDING },
          data: { status: StencilImportStatus.COMMITTED },
        })
        if (claimed.count === 0) throw new CommitRefused(VisioMessage.ALREADY_COMMITTED)

        const written: SummaryRow[] = []
        for (const { item, candidate } of plan) {
          const scaled = scaleRings(candidate.rings, input.scaleInchesPerInch)
          const fields = {
            category: item.category,
            shapeKind: item.shapeKind,
            rings: asJson(scaled.rings),
            widthIn: scaled.widthIn,
            heightIn: scaled.heightIn,
            fill: candidate.fill,
            stroke: candidate.stroke,
            thumbnailSvg: candidate.thumbnailSvg,
            source: OrgStencilSource.VISIO_IMPORT,
            sourceFile: pending.fileName,
            sourceMaster: candidate.name,
          }
          written.push(
            await tx.orgStencil.upsert({
              where: { orgId_name: { orgId: ctx.orgId, name: item.name } },
              create: { ...fields, orgId: ctx.orgId, name: item.name, createdBy },
              update: fields,
              select: summarySelect,
            }),
          )
        }
        return written
      })
    } catch (err) {
      if (err instanceof CommitRefused) return { ok: false, error: err.message }
      throw err
    }

    const replaced = plan.filter(({ item }) => replacing.has(item.name)).length
    return {
      ok: true,
      data: { created: plan.length - replaced, replaced, stencils: rows.map(toSummary) },
    }
  },
})

register({
  id: LibraryCommand.LIST,
  label: 'List my stencil library',
  description: "The stencils this organization has imported, grouped by category and sorted by name.",
  category: 'template',
  inputSchema: z.object({}),
  outputSchema: ListOutputSchema,
  voiceExamples: ['What is in my stencil library?'],
  execute: async (_input, ctx) => {
    const unauthenticated = notAuthenticated<ListOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const rows = await db.orgStencil.findMany({
      where: { orgId: ctx.orgId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: summarySelect,
    })
    return { ok: true, data: { stencils: rows.map(toSummary) } }
  },
})

register({
  id: LibraryCommand.PLACE,
  label: 'Place a stencil from my library',
  description: 'Drop one of this organization\'s own stencils onto the drawing at real size.',
  category: 'template',
  inputSchema: PlaceInputSchema,
  outputSchema: PlaceOutputSchema,
  voiceExamples: ['Drop my kidney pool here.'],
  runsOn: 'client',
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<PlaceOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const row = await db.orgStencil.findFirst({
      where: { id: input.orgStencilId, orgId: ctx.orgId },
      select: { name: true, shapeKind: true, widthIn: true, heightIn: true, rings: true },
    })
    if (!row) return { ok: false, error: VisioMessage.NOT_FOUND }

    const rings = z.array(RingSchema).safeParse(row.rings)
    const shapeKind = PlaceableShapeKindSchema.safeParse(row.shapeKind)
    const points = rings.success ? rings.data[0] : undefined
    if (!points || !shapeKind.success) return { ok: false, error: VisioMessage.NOT_FOUND }

    return {
      ok: true,
      data: {
        shapeKind: shapeKind.data,
        name: row.name,
        width: row.widthIn,
        height: row.heightIn,
        points,
        shapeId: CLIENT_PENDING_SHAPE_ID,
      },
    }
  },
})

register({
  id: LibraryCommand.DELETE,
  label: 'Delete a stencil from my library',
  description: 'Remove one of this organization\'s own stencils. Drawings that already use it are untouched.',
  category: 'template',
  inputSchema: DeleteInputSchema,
  outputSchema: DeleteOutputSchema,
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<DeleteOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const result = await db.orgStencil.deleteMany({ where: { id: input.orgStencilId, orgId: ctx.orgId } })
    if (result.count === 0) return { ok: false, error: VisioMessage.NOT_FOUND }
    return { ok: true, data: { deleted: true } }
  },
})
