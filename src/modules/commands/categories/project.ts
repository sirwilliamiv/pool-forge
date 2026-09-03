import { z } from 'zod'
import type { ProjectStatus } from '@prisma/client'
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
 * Everything the project page can edit, as one write.
 *
 * The detail page autosaves the whole form (as ProjectForm always has) rather
 * than patching field by field: the last write wins wholesale, which is the
 * same behaviour the page had as a server action, now with an audit row behind
 * it. Status is deliberately absent — it is set in exactly one place, through
 * `project.status.set`, because some transitions change what the customer can
 * see and deserve their own confirmation.
 */
const projectUpdateFieldsSchema = z.object({
  name: z.string().min(1),
  salesperson: z.string(),
  designer: z.string(),
  proposalExpiresAt: z.string(),
  internalNotes: z.string(),
  jurisdiction: z.string(),
  parcelId: z.string(),
  // Where the pool is going. The formatted string prints on documents; the
  // coordinates feed the editor's satellite import. Null coordinates mean the
  // address was typed rather than picked from autocomplete.
  siteAddress: z.string(),
  sitePlaceId: z.string().nullable(),
  latitude: z.number().min(-85).max(85).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  customerName: z.string(),
  customerEmail: z.string(),
  customerPhone: z.string(),
  /** Only when it differs from the site address; '' means "same as site". */
  billingAddress: z.string(),
  customerNotes: z.string(),
  poolType: z.string(),
  interiorFinish: z.string(),
  equipmentPackage: z.string(),
  sanitizationPackage: z.string(),
  heaterSelection: z.string(),
  lightingSelection: z.string(),
  deckMaterial: z.string(),
  copingMaterial: z.string(),
  screenOption: z.string(),
  heaterSelected: z.boolean(),
  saltSystemSelected: z.boolean(),
  screenSelected: z.boolean(),
  lightingQuantity: z.number().int().min(0),
})

export type ProjectUpdateFields = z.infer<typeof projectUpdateFieldsSchema>

/**
 * Invalidate the cached pages a project write makes stale.
 *
 * Best-effort: inside a route handler this reaches Next's cache; from an
 * integration test there is no request store, and a cache that does not exist
 * needs no invalidating.
 */
async function revalidateProjectPaths(projectId: string): Promise<void> {
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath('/dashboard')
    revalidatePath(`/projects/${projectId}`)
  } catch {
    // No request context (tests, scripts): nothing is cached.
  }
}

register({
  id: 'project.update',
  label: 'Update project details',
  description:
    'Save the project page: site address, customer, permit facts, pool specs, and equipment selections.',
  category: 'project',
  inputSchema: z.object({
    projectId: z.string().min(1),
    fields: projectUpdateFieldsSchema,
  }),
  outputSchema: z.object({
    savedAt: z.string(),
  }),
  voiceExamples: [
    'Set the salesperson to Ray Delgado.',
    'The customer email is dana@example.com.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId
    const { fields } = input

    const { db } = await import('@/lib/db')
    const { poolFieldsSchema } = await import('@/modules/projects/pool-fields')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId },
      select: { id: true, customerId: true },
    })
    if (!project) return { ok: false, error: 'Project not found' }

    const poolFields = poolFieldsSchema.parse({
      poolType: fields.poolType,
      interiorFinish: fields.interiorFinish,
      equipmentPackage: fields.equipmentPackage,
      sanitizationPackage: fields.sanitizationPackage,
      heaterSelection: fields.heaterSelection,
      lightingSelection: fields.lightingSelection,
      deckMaterial: fields.deckMaterial,
      copingMaterial: fields.copingMaterial,
      screenOption: fields.screenOption,
      heaterSelected: fields.heaterSelected,
      saltSystemSelected: fields.saltSystemSelected,
      screenSelected: fields.screenSelected,
      lightingQuantity: fields.lightingQuantity,
    })

    await db.$transaction(async tx => {
      let customerId = project.customerId
      if (fields.customerName.trim()) {
        const customerData = {
          name: fields.customerName.trim(),
          email: fields.customerEmail || null,
          phone: fields.customerPhone || null,
          // The billing address, kept only when it differs from the site
          // address. The site address is the project's own column now, so an
          // empty billing box means "bill the site" and stores nothing.
          address: fields.billingAddress.trim() || null,
          notes: fields.customerNotes || null,
        }
        if (customerId) {
          // orgId in the WHERE, not only implied by the project: the repo rule
          // is that every write carries its org so a mis-linked row can never
          // be updated across organisations. updateMany keeps the filter on the
          // write itself.
          await tx.customer.updateMany({ where: { id: customerId, orgId }, data: customerData })
        } else {
          const created = await tx.customer.create({ data: { orgId, ...customerData } })
          customerId = created.id
        }
      }
      await tx.project.update({
        where: { id: project.id },
        data: {
          name: fields.name,
          salesperson: fields.salesperson || null,
          designer: fields.designer || null,
          proposalExpiresAt: fields.proposalExpiresAt ? new Date(fields.proposalExpiresAt) : null,
          internalNotes: fields.internalNotes || null,
          jurisdiction: fields.jurisdiction.trim() || null,
          parcelId: fields.parcelId.trim() || null,
          siteAddress: fields.siteAddress.trim() || null,
          sitePlaceId: fields.sitePlaceId,
          latitude: fields.latitude,
          longitude: fields.longitude,
          poolFields: poolFields as never,
          ...(customerId ? { customerId } : {}),
        },
      })
    })

    // Without this the dashboard and the project's own header keep serving a
    // cached name. It happens to look fine in dev, where there is no full
    // route cache, and would be stale in production.
    await revalidateProjectPaths(project.id)

    return { ok: true, data: { savedAt: new Date().toISOString() } }
  },
})

register({
  id: 'project.status.set',
  label: 'Set project status',
  description:
    'Move a project along the pipeline: Draft, Ready for review, Proposal sent, Approved, Construction ready, or Archived.',
  category: 'project',
  inputSchema: z.object({
    projectId: z.string().min(1),
    status: ProjectStatusSchema,
  }),
  outputSchema: z.object({
    projectId: z.string(),
    status: ProjectStatusSchema,
    previousStatus: ProjectStatusSchema,
  }),
  voiceExamples: [
    'Mark this project approved.',
    'Set the status to proposal sent.',
  ],
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { db } = await import('@/lib/db')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId },
      select: { id: true, status: true },
    })
    if (!project) return { ok: false, error: 'Project not found' }

    // updateMany keeps the org filter on the write, not only on the read.
    await db.project.updateMany({
      where: { id: project.id, orgId },
      data: { status: input.status },
    })

    await revalidateProjectPaths(project.id)

    return {
      ok: true,
      data: { projectId: project.id, status: input.status, previousStatus: project.status },
    }
  },
})
