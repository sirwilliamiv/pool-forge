// Customer-intake link management.
//
// Category `settings`, since the intake UI lives at `/settings/intake`, but a
// separate file from `categories/import.ts`: the pipeline commands there are
// owned by other tracks and both files register into the same registry, so
// keeping them apart costs nothing and keeps the tracks from editing the same
// lines.
//
// Every button in the settings UI dispatches one of these. No event handler in
// this track touches Prisma.
//
// `db` is imported lazily, matching `categories/import.ts`, so the registry
// stays loadable in the jsdom unit tests that import every category to assert
// the catalog.

import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import { INTAKE_MAX_LABEL_CHARS } from '@/modules/imports/intake/constants'
import { mintIntakeToken, normalizeLabel } from '@/modules/imports/intake/links'
import {
  IntakeLinkCreateSchema,
  IntakeLinkOutputSchema,
  IntakeLinkUpdateSchema,
  type IntakeLinkOutput,
} from '@/modules/imports/intake/schema'

const ANONYMOUS = 'anonymous'

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: 'Not authenticated' }
  return null
}

interface LinkRow {
  id: string
  token: string
  label: string
  active: boolean
  expiresAt: Date | null
}

function toOutput(row: LinkRow, submissionCount: number): IntakeLinkOutput {
  return {
    linkId: row.id,
    token: row.token,
    label: row.label,
    active: row.active,
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    submissionCount,
  }
}

register({
  id: 'import.intake.link.create',
  label: 'Create customer upload link',
  description:
    'Mint a public intake link a customer can use to send inspiration photos, a sketch, or a survey. Submissions land as a draft project with an import session waiting.',
  category: 'settings',
  inputSchema: IntakeLinkCreateSchema,
  outputSchema: IntakeLinkOutputSchema,
  voiceExamples: [
    'Create a customer upload link.',
    'Make an intake link for the spring campaign.',
  ],
  execute: async (input, ctx): Promise<CommandResult<IntakeLinkOutput>> => {
    const unauthenticated = notAuthenticated<IntakeLinkOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const label = normalizeLabel(input.label)
    if (label.length === 0) return { ok: false, error: 'Give the link a label' }

    let expiresAt: Date | null = null
    if (input.expiresAt != null) {
      const parsed = new Date(input.expiresAt)
      if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'Invalid expiry date' }
      expiresAt = parsed
    }

    const { db } = await import('@/lib/db')
    const created = await db.intakeLink.create({
      data: {
        orgId: ctx.orgId,
        token: mintIntakeToken(),
        label,
        active: true,
        expiresAt,
      },
      select: { id: true, token: true, label: true, active: true, expiresAt: true },
    })

    return { ok: true, data: toOutput(created, 0) }
  },
})

register({
  id: 'import.intake.link.update',
  label: 'Update customer upload link',
  description:
    'Rename a customer upload link, change its expiry, or deactivate it. A deactivated link stops accepting uploads immediately and gives visitors the same response as a link that never existed.',
  category: 'settings',
  inputSchema: IntakeLinkUpdateSchema,
  outputSchema: IntakeLinkOutputSchema,
  voiceExamples: [
    'Deactivate the spring campaign upload link.',
    'Rename this intake link.',
  ],
  execute: async (input, ctx): Promise<CommandResult<IntakeLinkOutput>> => {
    const unauthenticated = notAuthenticated<IntakeLinkOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const existing = await db.intakeLink.findFirst({
      where: { id: input.linkId, orgId: ctx.orgId },
      select: { id: true },
    })
    if (!existing) return { ok: false, error: 'Upload link not found' }

    // exactOptionalPropertyTypes: build the update object field by field rather
    // than spreading optionals, which would write explicit `undefined` keys.
    const data: {
      label?: string
      active?: boolean
      expiresAt?: Date | null
    } = {}

    if (input.label !== undefined) {
      const label = normalizeLabel(input.label)
      if (label.length === 0) return { ok: false, error: 'Give the link a label' }
      if (label.length > INTAKE_MAX_LABEL_CHARS) return { ok: false, error: 'Label is too long' }
      data.label = label
    }
    if (input.active !== undefined) data.active = input.active
    if (input.expiresAt !== undefined) {
      if (input.expiresAt === null) {
        data.expiresAt = null
      } else {
        const parsed = new Date(input.expiresAt)
        if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'Invalid expiry date' }
        data.expiresAt = parsed
      }
    }

    if (Object.keys(data).length === 0) return { ok: false, error: 'Nothing to change' }

    const updated = await db.intakeLink.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        token: true,
        label: true,
        active: true,
        expiresAt: true,
        _count: { select: { submissions: true } },
      },
    })

    return { ok: true, data: toOutput(updated, updated._count.submissions) }
  },
})

const listOutput = z.object({ links: z.array(IntakeLinkOutputSchema) })

register({
  id: 'import.intake.link.list',
  label: 'List customer upload links',
  description:
    'Every customer upload link this organization owns, newest first, with how many submissions each has received.',
  category: 'settings',
  inputSchema: z.object({}),
  outputSchema: listOutput,
  voiceExamples: ['Show me my customer upload links.'],
  execute: async (_input, ctx): Promise<CommandResult<z.infer<typeof listOutput>>> => {
    const unauthenticated = notAuthenticated<z.infer<typeof listOutput>>(ctx)
    if (unauthenticated) return unauthenticated

    const { listIntakeLinks } = await import('@/modules/imports/intake/links')
    const links = await listIntakeLinks(ctx.orgId)
    return {
      ok: true,
      data: {
        links: links.map((link) =>
          toOutput(
            {
              id: link.id,
              token: link.token,
              label: link.label,
              active: link.active,
              expiresAt: link.expiresAt,
            },
            link.submissionCount,
          ),
        ),
      },
    }
  },
})
