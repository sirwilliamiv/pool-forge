import { db } from '@/lib/db'
import type { DesignVersionSource, Prisma } from '@prisma/client'

// Many designs for one job.
//
// Builders draw several before anybody agrees on one, and customers will draw
// their own through a share link. Both are the same object: a named alternative
// with its own drawing.
//
// Versions sit beside the project's working `Drawing` rather than replacing it.
// Every existing query that asks a project for its one drawing keeps working
// unchanged, and activating a version copies its payload into that drawing,
// which is the operation the editor, the quote and every export already
// understand. The alternative, many drawings per project, would have meant
// touching every one of those call sites to answer "which one".

/** What the version rack needs to draw a card, without the whole drawing. */
export interface VersionSummary {
  id: string
  name: string
  note: string | null
  source: DesignVersionSource
  authorName: string | null
  totalCents: number | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface VersionWithDrawing extends VersionSummary {
  rootJson: Prisma.JsonValue
}

/** How many a single job may hold. */
export const MAX_VERSIONS_PER_PROJECT = 40

export class VersionLimitError extends Error {
  constructor() {
    super(
      `A job can hold ${MAX_VERSIONS_PER_PROJECT} designs. Delete one you no longer need before saving another.`,
    )
    this.name = 'VersionLimitError'
  }
}

export class VersionNotFoundError extends Error {
  constructor() {
    super('That design is no longer on this job.')
    this.name = 'VersionNotFoundError'
  }
}

function summarise(
  row: {
    id: string
    name: string
    note: string | null
    source: DesignVersionSource
    createdByName: string | null
    totalCents: number | null
    createdAt: Date
    updatedAt: Date
    createdBy?: { name: string | null; email: string } | null
  },
  activeVersionId: string | null,
): VersionSummary {
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    source: row.source,
    // The account's name when there is one, the typed name when a customer
    // drew it through a share link, and nothing rather than an id.
    authorName: row.createdBy?.name ?? row.createdBy?.email ?? row.createdByName,
    totalCents: row.totalCents,
    isActive: row.id === activeVersionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** Every design on a job, oldest first, which is the order they were tried in. */
export async function listVersions(orgId: string, projectId: string): Promise<VersionSummary[]> {
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    select: { activeVersionId: true },
  })
  if (!project) return []

  const rows = await db.designVersion.findMany({
    where: { projectId, orgId },
    // Explicit, with id as the tiebreaker: two versions saved in the same
    // millisecond would otherwise shuffle between renders.
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      note: true,
      source: true,
      createdByName: true,
      totalCents: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  })
  return rows.map(row => summarise(row, project.activeVersionId))
}

export interface SaveVersionArgs {
  orgId: string
  projectId: string
  name: string
  note?: string
  source?: DesignVersionSource
  createdById?: string
  createdByName?: string
  /** Defaults to whatever the working drawing currently holds. */
  rootJson?: Prisma.InputJsonValue
  totalCents?: number
}

/**
 * Save the current drawing as a new named design.
 *
 * Reads the working drawing when no payload is given, so "save this as a
 * version" needs nothing from the caller but a name. A customer drawing through
 * a share link passes their own payload instead, because their work never
 * touches the builder's working drawing until somebody chooses it.
 */
export async function saveVersion(args: SaveVersionArgs): Promise<VersionSummary> {
  const project = await db.project.findFirst({
    where: { id: args.projectId, orgId: args.orgId },
    select: { id: true, activeVersionId: true },
  })
  if (!project) throw new VersionNotFoundError()

  const count = await db.designVersion.count({ where: { projectId: args.projectId } })
  if (count >= MAX_VERSIONS_PER_PROJECT) throw new VersionLimitError()

  let payload = args.rootJson
  if (payload === undefined) {
    const drawing = await db.drawing.findUnique({
      where: { projectId: args.projectId },
      select: { rootJson: true },
    })
    payload = (drawing?.rootJson ?? {}) as Prisma.InputJsonValue
  }

  const data: Prisma.DesignVersionUncheckedCreateInput = {
    projectId: args.projectId,
    orgId: args.orgId,
    name: args.name.trim() || `Design ${count + 1}`,
    source: args.source ?? 'BUILDER',
    rootJson: payload,
  }
  if (args.note?.trim()) data.note = args.note.trim()
  if (args.createdById) data.createdById = args.createdById
  if (args.createdByName?.trim()) data.createdByName = args.createdByName.trim()
  if (args.totalCents !== undefined) data.totalCents = args.totalCents

  const created = await db.designVersion.create({
    data,
    select: {
      id: true,
      name: true,
      note: true,
      source: true,
      createdByName: true,
      totalCents: true,
      createdAt: true,
      updatedAt: true,
      createdBy: { select: { name: true, email: true } },
    },
  })

  return summarise(created, project.activeVersionId)
}

/**
 * Open a version: copy it into the working drawing and mark it active.
 *
 * The current drawing is saved first when it belongs to no version, so
 * switching away from unsaved work does not throw it away. That autosave is the
 * difference between a version rack and a trap.
 */
export async function activateVersion(
  orgId: string,
  projectId: string,
  versionId: string,
): Promise<VersionSummary> {
  const [project, version] = await Promise.all([
    db.project.findFirst({
      where: { id: projectId, orgId },
      select: { id: true, activeVersionId: true },
    }),
    db.designVersion.findFirst({
      where: { id: versionId, projectId, orgId },
      select: { id: true, rootJson: true },
    }),
  ])
  if (!project || !version) throw new VersionNotFoundError()

  await db.$transaction(async tx => {
    if (project.activeVersionId === null) {
      const drawing = await tx.drawing.findUnique({
        where: { projectId },
        select: { rootJson: true },
      })
      const shapes = (drawing?.rootJson as { shapes?: unknown[] } | null)?.shapes
      // Only when there is something to lose. An empty drawing saved as a
      // version would fill the rack with blank cards on every switch.
      if (Array.isArray(shapes) && shapes.length > 0) {
        const count = await tx.designVersion.count({ where: { projectId } })
        await tx.designVersion.create({
          data: {
            projectId,
            orgId,
            name: `Unsaved work ${count + 1}`,
            note: 'Kept automatically when another design was opened.',
            rootJson: (drawing?.rootJson ?? {}) as Prisma.InputJsonValue,
          },
        })
      }
    }

    await tx.drawing.upsert({
      where: { projectId },
      create: { projectId, scale: 1, rootJson: version.rootJson as Prisma.InputJsonValue },
      update: { rootJson: version.rootJson as Prisma.InputJsonValue },
    })
    await tx.project.update({
      where: { id: projectId },
      data: { activeVersionId: versionId },
    })
  })

  const versions = await listVersions(orgId, projectId)
  const found = versions.find(v => v.id === versionId)
  if (!found) throw new VersionNotFoundError()
  return found
}

export async function renameVersion(
  orgId: string,
  versionId: string,
  name: string,
  note?: string,
): Promise<void> {
  const data: Prisma.DesignVersionUpdateInput = { name: name.trim() }
  if (note !== undefined) data.note = note.trim() || null
  const result = await db.designVersion.updateMany({ where: { id: versionId, orgId }, data })
  if (result.count === 0) throw new VersionNotFoundError()
}

/**
 * Delete a version.
 *
 * The active one is refused rather than silently leaving the working drawing
 * orphaned from the card that describes it.
 */
export async function deleteVersion(orgId: string, versionId: string): Promise<void> {
  const version = await db.designVersion.findFirst({
    where: { id: versionId, orgId },
    select: { id: true, activeFor: { select: { id: true } } },
  })
  if (!version) throw new VersionNotFoundError()
  if (version.activeFor) {
    throw new Error('That design is the one currently open. Open another before deleting it.')
  }
  await db.designVersion.delete({ where: { id: versionId } })
}
