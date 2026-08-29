import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'

// Scene templates: the drawing a builder keeps reaching for, saved once and
// applied to new work.
//
// Distinct from `ShapeTemplate`, which models a single shape. Most builders
// repeat a whole arrangement, not one object: the house wall where their lots
// usually sit, the deck they always start from, the trees along a back fence.
//
// `db` is imported lazily so the registry stays loadable in the jsdom unit tests
// that import every category to assert the catalog.

const ANONYMOUS = 'anonymous'

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: 'Not authenticated' }
  return null
}

const templateSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  objectCount: z.number().int(),
  isDefault: z.boolean(),
  updatedAt: z.string(),
})

type TemplateSummary = z.infer<typeof templateSummary>

/** Shapes out of a stored drawing payload, tolerating an empty or legacy row. */
function shapesOf(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return []
  const shapes = (payload as { shapes?: unknown }).shapes
  return Array.isArray(shapes) ? shapes : []
}

register({
  id: 'template.scene.save',
  label: 'Save scene as template',
  description:
    "Save this project's drawing as a reusable scene, so later projects can start from it instead of an empty sheet.",
  category: 'template',
  inputSchema: z.object({
    projectId: z.string().min(1),
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    /** Replace a template of the same name rather than failing on the unique index. */
    overwrite: z.boolean().default(false),
  }),
  outputSchema: z.object({
    templateId: z.string(),
    objectCount: z.number().int(),
  }),
  voiceExamples: [
    'Save this scene as a template called Standard backyard.',
    'Save this layout so I can start from it next time.',
  ],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<{ templateId: string; objectCount: number }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId: ctx.orgId },
      select: { id: true },
    })
    if (!project) return { ok: false, error: 'Project not found' }

    const drawing = await db.drawing.findUnique({
      where: { projectId: project.id },
      select: { rootJson: true },
    })
    const shapes = shapesOf(drawing?.rootJson)
    if (shapes.length === 0) {
      return { ok: false, error: 'There is nothing on this sheet to save as a template.' }
    }

    // Only the shapes travel. A template is a starting arrangement, not a copy
    // of another job's survey image or its calibration.
    const payload = { shapes } as unknown as object

    const existing = await db.sceneTemplate.findFirst({
      where: { orgId: ctx.orgId, name: input.name },
      select: { id: true },
    })
    if (existing && !input.overwrite) {
      return {
        ok: false,
        error: `A scene template called "${input.name}" already exists. Rename it, or save again to replace it.`,
      }
    }

    const data = {
      name: input.name,
      description: input.description ?? null,
      payload,
      objectCount: shapes.length,
    }

    // Attribute only to a user that actually exists. `createdBy` is a foreign
    // key, and a context carrying an id with no row behind it would surface a
    // raw constraint violation to the caller instead of saving the template.
    const author = await db.user.findUnique({ where: { id: ctx.userId }, select: { id: true } })

    const saved = existing
      ? await db.sceneTemplate.update({ where: { id: existing.id }, data, select: { id: true } })
      : await db.sceneTemplate.create({
          data: { ...data, orgId: ctx.orgId, createdBy: author?.id ?? null },
          select: { id: true },
        })

    return { ok: true, data: { templateId: saved.id, objectCount: shapes.length } }
  },
})

register({
  id: 'template.scene.list',
  label: 'List scene templates',
  description: 'The scene templates this organization has saved, most recently updated first.',
  category: 'template',
  inputSchema: z.object({}),
  outputSchema: z.object({ templates: z.array(templateSummary) }),
  voiceExamples: ['What scene templates do we have?', 'List my saved scenes.'],
  execute: async (_input, ctx) => {
    const unauthenticated = notAuthenticated<{ templates: TemplateSummary[] }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const rows = await db.sceneTemplate.findMany({
      where: { orgId: ctx.orgId },
      // Default first so the starting scene is always at the top, then by
      // recency. An explicit tiebreaker keeps the order stable across reads.
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        objectCount: true,
        isDefault: true,
        updatedAt: true,
      },
    })

    return {
      ok: true,
      data: {
        templates: rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          objectCount: row.objectCount,
          isDefault: row.isDefault,
          updatedAt: row.updatedAt.toISOString(),
        })),
      },
    }
  },
})

register({
  id: 'template.scene.apply',
  label: 'Apply scene template',
  description:
    'Put a saved scene into this project, either alongside what is already drawn or in place of it.',
  category: 'template',
  inputSchema: z.object({
    projectId: z.string().min(1),
    templateId: z.string().min(1),
    /** `merge` adds the template's objects; `replace` discards what is there. */
    mode: z.enum(['merge', 'replace']).default('merge'),
    /** Required for `replace` when the sheet is not empty. */
    confirmReplace: z.boolean().default(false),
  }),
  outputSchema: z.object({
    added: z.number().int(),
    total: z.number().int(),
    replaced: z.number().int(),
  }),
  voiceExamples: ['Start this project from the standard backyard template.', 'Apply my saved scene.'],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<{ added: number; total: number; replaced: number }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')

    const [project, template] = await Promise.all([
      db.project.findFirst({ where: { id: input.projectId, orgId: ctx.orgId }, select: { id: true } }),
      db.sceneTemplate.findFirst({
        where: { id: input.templateId, orgId: ctx.orgId },
        select: { payload: true },
      }),
    ])
    if (!project) return { ok: false, error: 'Project not found' }
    if (!template) return { ok: false, error: 'Scene template not found' }

    const incoming = shapesOf(template.payload)
    if (incoming.length === 0) {
      return { ok: false, error: 'That scene template is empty.' }
    }

    const drawing = await db.drawing.findUnique({
      where: { projectId: project.id },
      select: { rootJson: true },
    })
    const current = shapesOf(drawing?.rootJson)

    // Replacing a drawing is unrecoverable, so it names what it is about to
    // discard and refuses until the caller has said yes to that specific number.
    if (input.mode === 'replace' && current.length > 0 && !input.confirmReplace) {
      return {
        ok: false,
        error: `Replacing discards the ${current.length} object${current.length === 1 ? '' : 's'} already on this sheet. Confirm to continue.`,
      }
    }

    // Fresh ids: the same template applied twice must not collide with itself.
    const stamped = incoming.map((shape, index) => ({
      ...(shape as Record<string, unknown>),
      id: `tpl_${Date.now().toString(36)}_${index}`,
    }))

    const replaced = input.mode === 'replace' ? current.length : 0
    const shapes = input.mode === 'replace' ? stamped : [...current, ...stamped]
    const root = { ...(drawing?.rootJson as object | undefined), shapes } as unknown as object

    await db.drawing.upsert({
      where: { projectId: project.id },
      create: { projectId: project.id, scale: 1, rootJson: root },
      update: { rootJson: root },
    })

    return { ok: true, data: { added: stamped.length, total: shapes.length, replaced } }
  },
})

register({
  id: 'template.scene.setDefault',
  label: 'Set the starting scene',
  description:
    'Choose which saved scene new projects start from. Pass no template to go back to starting empty.',
  category: 'template',
  inputSchema: z.object({ templateId: z.string().min(1).nullable() }),
  outputSchema: z.object({ templateId: z.string().nullable() }),
  voiceExamples: ['Make this the scene new projects start from.', 'Start new projects empty again.'],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<{ templateId: string | null }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')

    if (input.templateId !== null) {
      const owned = await db.sceneTemplate.findFirst({
        where: { id: input.templateId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!owned) return { ok: false, error: 'Scene template not found' }
    }

    // One default per org, so the clear and the set happen together or not at
    // all. Two defaults would make "what do new projects start from" ambiguous.
    await db.$transaction([
      db.sceneTemplate.updateMany({
        where: { orgId: ctx.orgId, isDefault: true },
        data: { isDefault: false },
      }),
      ...(input.templateId
        ? [
            db.sceneTemplate.update({
              where: { id: input.templateId },
              data: { isDefault: true },
            }),
          ]
        : []),
    ])

    return { ok: true, data: { templateId: input.templateId } }
  },
})

register({
  id: 'template.scene.delete',
  label: 'Delete scene template',
  description: 'Remove a saved scene. Projects already started from it are untouched.',
  category: 'template',
  inputSchema: z.object({ templateId: z.string().min(1) }),
  outputSchema: z.object({ deleted: z.boolean() }),
  voiceExamples: ['Delete the standard backyard template.'],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<{ deleted: boolean }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const result = await db.sceneTemplate.deleteMany({
      where: { id: input.templateId, orgId: ctx.orgId },
    })
    if (result.count === 0) return { ok: false, error: 'Scene template not found' }
    return { ok: true, data: { deleted: true } }
  },
})
