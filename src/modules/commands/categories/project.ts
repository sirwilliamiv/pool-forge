import { z } from 'zod'
import { register } from '@/modules/commands/registry'

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
          customerId?: string
          salesperson?: string
          designer?: string
        } = { orgId, name }
        if (customerId) data.customerId = customerId
        if (input.salesperson) data.salesperson = input.salesperson
        if (input.designer) data.designer = input.designer

        return tx.project.create({ data, select: { id: true, name: true } })
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
  execute: async () => ({ ok: false, error: 'not implemented' }),
})
