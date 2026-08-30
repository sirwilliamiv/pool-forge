import { z } from 'zod'
import type { Prisma, ProjectStatus } from '@prisma/client'
import { register } from '@/modules/commands/registry'
import { nextJobNumber } from '@/modules/projects/job-number'

register({
  id: 'create.project',
  label: 'Create project',
  description:
    'Create a new pool design project. Give the customer name and a customer record is created with it.',
  category: 'project',
  inputSchema: z.object({
    name: z.string().min(1),
    /** A name, not an id: nobody says "create a project for cus_01H8...". */
    customerName: z.string().min(1).optional(),
    customerId: z.string().optional(),
    salesperson: z.string().optional(),
    designer: z.string().optional(),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    name: z.string(),
    path: z.string(),
  }),
  voiceExamples: [
    'Create a new project for the Smith family.',
    'Start a new pool project named Backyard Build.',
    'New job for the Whitfields.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const name = input.name.trim()
    if (!name) return { ok: false, error: 'A project needs a name.' }

    const { db } = await import('@/lib/db')

    // Customer and project in one transaction: a customer with no project is
    // a row nothing in the app will ever show, so a half-completed create is
    // worse than none.
    let project: { id: string; name: string }
    try {
      project = await db.$transaction(async tx => {
        let customerId = input.customerId

        if (customerId) {
          // Org scoping is not optional, and an id arriving from a voice call is
          // exactly the one to check.
          const existing = await tx.customer.findFirst({
            where: { id: customerId, orgId },
            select: { id: true },
          })
          if (!existing) throw new Error('CUSTOMER_NOT_FOUND')
        } else if (input.customerName?.trim()) {
          const customerName = input.customerName.trim()
          // Reuse rather than duplicate: saying the same family name twice should
          // not leave two customer records behind.
          const existing = await tx.customer.findFirst({
            where: { orgId, name: { equals: customerName, mode: 'insensitive' } },
            orderBy: { id: 'asc' },
            select: { id: true },
          })
          customerId = existing
            ? existing.id
            : (await tx.customer.create({ data: { orgId, name: customerName }, select: { id: true } })).id
        }

        const data: {
          orgId: string
          name: string
          jobNumber: number
          customerId?: string
          salesperson?: string
          designer?: string
        } = {
          orgId,
          name,
          // Assigned inside this transaction, under an advisory lock keyed on
          // the organisation. Two projects created in the same moment queue
          // rather than both claiming 1042; the unique index catches anything
          // that reaches the table another way.
          jobNumber: await nextJobNumber(tx, orgId),
        }
        if (customerId) data.customerId = customerId
        if (input.salesperson) data.salesperson = input.salesperson
        if (input.designer) data.designer = input.designer

          const created = await tx.project.create({ data, select: { id: true, name: true } })

        // Start from the organisation's default scene when it has one. Doing it
        // here rather than on first open means the drawing exists before anyone
        // looks at it, so the editor, the proposal and the quote all agree from
        // the moment the project is created.
        const starting = await tx.sceneTemplate.findFirst({
          where: { orgId, isDefault: true },
          select: { payload: true },
        })
        if (starting) {
          await tx.drawing.create({
            data: {
              projectId: created.id,
              scale: 1,
              rootJson: starting.payload as never,
            },
          })
        }

        return created
      })
    } catch (error) {
      // A named error rather than the raw Prisma text, which carries table and
      // column detail that has no business being read aloud.
      if (error instanceof Error && error.message === 'CUSTOMER_NOT_FOUND') {
        return { ok: false, error: 'That customer is not in this organisation.' }
      }
      throw error
    }

    return { ok: true, data: { projectId: project.id, name: project.name, path: `/projects/${project.id}` } }
  },
})

register({
  id: 'open.project',
  label: 'Open project',
  description: 'Open an existing project by id.',
  category: 'project',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    projectId: z.string(),
  }),
  voiceExamples: [
    'Open the Smith project.',
    'Open project 12345.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

register({
  id: 'save.project',
  label: 'Save project',
  description: 'Persist the current drawing, pool fields, and notes.',
  category: 'project',
  inputSchema: z.object({
    projectId: z.string(),
  }),
  outputSchema: z.object({
    savedAt: z.string(),
  }),
  voiceExamples: [
    'Save the project.',
    'Save my work.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

/**
 * A plain tuple, not `z.nativeEnum(ProjectStatus)`.
 *
 * The imported Prisma enum object is undefined in some server runtimes, so
 * building a schema from it throws at module load and takes every command in
 * the registry down with it. That has already happened once here, to
 * `CommandSource`. Prisma accepts the literal string for an enum column, so
 * nothing needs converting at the write.
 */
const PROJECT_STATUSES = [
  'DRAFT',
  'READY_FOR_REVIEW',
  'PROPOSAL_SENT',
  'APPROVED',
  'CONSTRUCTION_READY',
  'ARCHIVED',
] as const satisfies readonly ProjectStatus[]

const ProjectStatusSchema = z.enum(PROJECT_STATUSES)

/**
 * Where a project sits on the pipeline, so acceptance can move it forward
 * without ever moving it back.
 *
 * ARCHIVED is deliberately absent: it is off the pipeline, not a point on it,
 * and it is a decision the builder made explicitly. A late signature on an
 * archived job records the acceptance and leaves the archive alone; revoking
 * the share link is how you stop accepting.
 */
const PIPELINE_RANK = {
  DRAFT: 0,
  READY_FOR_REVIEW: 1,
  PROPOSAL_SENT: 2,
  APPROVED: 3,
  CONSTRUCTION_READY: 4,
} as const satisfies Partial<Record<ProjectStatus, number>>

/**
 * The status a signed acceptance implies, unless the project is already
 * further along. Exported so a test can state the rule rather than restate the
 * implementation.
 */
export function statusAfterAcceptance(current: ProjectStatus): ProjectStatus {
  const rank = (PIPELINE_RANK as Partial<Record<ProjectStatus, number>>)[current]
  if (rank === undefined) return current
  return rank < PIPELINE_RANK.APPROVED ? 'APPROVED' : current
}

register({
  id: 'project.proposal.accept',
  label: 'Record proposal acceptance',
  description:
    "Record a customer's signed acceptance of a shared proposal and advance the project to Approved. Idempotent: a second acceptance keeps the first signature.",
  category: 'project',
  inputSchema: z.object({
    projectId: z.string().min(1),
    /** The name the customer typed. Never an id, never an email. */
    acceptedName: z.string().trim().min(1).max(120),
  }),
  outputSchema: z.object({
    projectId: z.string(),
    status: ProjectStatusSchema,
    previousStatus: ProjectStatusSchema,
    statusChanged: z.boolean(),
    acceptedName: z.string(),
    acceptedAt: z.string(),
    alreadyAccepted: z.boolean(),
  }),
  voiceExamples: ['Mark the Rivera proposal as accepted by Dana Reyes.'],
  // The acceptance itself arrives on the PUBLIC share route, which has no
  // session. `ctx.orgId` there is read off the project the share token
  // resolved to, never off anything the caller sent, so this query's org
  // filter is a genuine check that the token and the project agree rather
  // than a tautology.
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId },
      select: {
        id: true,
        status: true,
        proposalAcceptedAt: true,
        proposalAcceptedName: true,
      },
    })
    if (!project) return { ok: false, error: 'Proposal not found' }

    const acceptedName = input.acceptedName.trim()
    const previousStatus = project.status
    const nextStatus = statusAfterAcceptance(previousStatus)

    // A second signature does not overwrite the first: the first one is the
    // one the customer's copy of the proposal shows.
    const alreadyAccepted = project.proposalAcceptedAt !== null
    const acceptedAt = project.proposalAcceptedAt ?? new Date()
    const recordedName = alreadyAccepted
      ? (project.proposalAcceptedName ?? acceptedName)
      : acceptedName

    // updateMany keeps the org filter on the write, not only on the read.
    await db.project.updateMany({
      where: { id: project.id, orgId },
      data: {
        proposalAcceptedAt: acceptedAt,
        proposalAcceptedName: recordedName,
        status: nextStatus,
      },
    })

    return {
      ok: true,
      data: {
        projectId: project.id,
        status: nextStatus,
        previousStatus,
        statusChanged: nextStatus !== previousStatus,
        acceptedName: recordedName,
        acceptedAt: acceptedAt.toISOString(),
        alreadyAccepted,
      },
    }
  },
})

/**
 * Lifecycle commands (status, duplicate, archive, delete) that used to live as
 * direct server actions in `src/modules/projects/actions.ts`. The voice
 * destructive gate names two of these ids, so they have to be real commands
 * rather than dead strings a spoken "delete this" could never actually reach.
 */

register({
  id: 'project.status.set',
  label: 'Set project status',
  description: 'Move a project to a different status.',
  category: 'project',
  inputSchema: z.object({ projectId: z.string().min(1), status: ProjectStatusSchema }),
  outputSchema: z.object({ projectId: z.string(), status: ProjectStatusSchema }),
  voiceExamples: ['Mark this project approved.', 'Move this job to proposal sent.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { db } = await import('@/lib/db')

    const result = await db.project.updateMany({
      where: { id: input.projectId, orgId: ctx.orgId },
      data: { status: input.status },
    })
    if (result.count === 0) return { ok: false, error: 'Project not found' }

    return { ok: true, data: { projectId: input.projectId, status: input.status } }
  },
})

register({
  id: 'project.archive',
  label: 'Archive project',
  description:
    'Move a project off the active pipeline. It stays visible as archived and can be brought back by changing its status again.',
  category: 'project',
  inputSchema: z.object({ projectId: z.string().min(1) }),
  outputSchema: z.object({ projectId: z.string() }),
  voiceExamples: ['Archive this project.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { db } = await import('@/lib/db')

    const result = await db.project.updateMany({
      where: { id: input.projectId, orgId: ctx.orgId },
      data: { status: 'ARCHIVED' },
    })
    if (result.count === 0) return { ok: false, error: 'Project not found' }

    return { ok: true, data: { projectId: input.projectId } }
  },
})

register({
  id: 'project.delete',
  label: 'Delete project',
  description:
    'Permanently delete a project. Removes the drawing, quotes, exports, and validation runs. Cannot be undone.',
  category: 'project',
  inputSchema: z.object({ projectId: z.string().min(1) }),
  outputSchema: z.object({ projectId: z.string() }),
  voiceExamples: ['Delete this project.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const { db } = await import('@/lib/db')

    const result = await db.project.deleteMany({
      where: { id: input.projectId, orgId: ctx.orgId },
    })
    if (result.count === 0) return { ok: false, error: 'Project not found' }

    return { ok: true, data: { projectId: input.projectId } }
  },
})

register({
  id: 'project.duplicate',
  label: 'Duplicate project',
  description: 'Create a copy of a project, as a new draft with its own job number.',
  category: 'project',
  inputSchema: z.object({ projectId: z.string().min(1) }),
  outputSchema: z.object({ projectId: z.string() }),
  voiceExamples: ['Duplicate this job.', 'Copy this project.'],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId
    const { db } = await import('@/lib/db')

    const source = await db.project.findFirst({
      where: { id: input.projectId, orgId },
      include: { customer: true, drawing: true },
    })
    if (!source) return { ok: false, error: 'Project not found' }

    const newId = await db.$transaction(async tx => {
      const projectData: Prisma.ProjectCreateInput = {
        org: { connect: { id: orgId } },
        name: `${source.name} (Copy)`,
        status: 'DRAFT',
        poolFields: source.poolFields as unknown as Prisma.InputJsonValue,
        // A copy is a different job and gets its own number. Carrying the
        // original's over would put two projects on one reference, which is
        // the one thing a job number must never do.
        jobNumber: await nextJobNumber(tx, orgId),
      }
      if (source.salesperson) projectData.salesperson = source.salesperson
      if (source.designer) projectData.designer = source.designer
      if (source.internalNotes) projectData.internalNotes = source.internalNotes
      if (source.customer) projectData.customer = { connect: { id: source.customer.id } }

      const created = await tx.project.create({ data: projectData })

      if (source.drawing) {
        await tx.drawing.create({
          data: {
            projectId: created.id,
            scale: source.drawing.scale,
            rootJson: source.drawing.rootJson as unknown as Prisma.InputJsonValue,
          },
        })
      }
      return created.id
    })

    return { ok: true, data: { projectId: newId } }
  },
})
