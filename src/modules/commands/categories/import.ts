import { z } from 'zod'

import { register, type CommandContext, type CommandResult } from '@/modules/commands/registry'
import {
  DesignIntentSchema,
  ScaleMethodSchema,
  emptyDesignIntent,
  hasResolvedScale,
  unreviewedFieldPaths,
  type DesignIntent,
} from '@/modules/imports/intent'
import { intentToShapes } from '@/modules/imports/precision/translate'
import {
  parseDrawingPayload,
  serializeDrawingPayload,
} from '@/modules/editor/drawing-payload'
import { readPoolFields, type PoolFields } from '@/modules/projects/pool-fields'
import {
  DesignIntentPatchSchema,
  applyIntentPatch,
  parseStoredIntent,
  touchedPaths,
} from '@/modules/imports/patch'

// Image ingestion commands. Every user-driven step of the pipeline dispatches
// through here, including the ones a route triggers on the user's behalf: the
// upload route parses bytes and then calls `import.image.upload`.
//
// `db` is imported lazily so the registry stays loadable in the jsdom unit
// tests that import every category to assert the catalog.

const ANONYMOUS = 'anonymous'

const sessionOutput = z.object({
  sessionId: z.string(),
  status: z.enum(['DRAFT', 'READY', 'APPLIED', 'DISCARDED']),
  intent: DesignIntentSchema,
})

type SessionOutput = z.infer<typeof sessionOutput>

function notAuthenticated<T>(ctx: CommandContext): CommandResult<T> | null {
  if (ctx.orgId === ANONYMOUS || !ctx.orgId) return { ok: false, error: 'Not authenticated' }
  return null
}

/** Loads an org-scoped session and its intent, or an error result. */
async function loadSession(
  sessionId: string,
  ctx: CommandContext,
): Promise<
  | { ok: true; id: string; intent: DesignIntent; touchedFieldPaths: string[] }
  | { ok: false; error: string }
> {
  const { db } = await import('@/lib/db')
  const row = await db.importSession.findFirst({
    where: { id: sessionId, orgId: ctx.orgId },
    select: { id: true, designIntentJson: true, touchedFieldPaths: true },
  })
  if (!row) return { ok: false, error: 'Import session not found' }
  return {
    ok: true,
    id: row.id,
    intent: parseStoredIntent(row.designIntentJson) ?? emptyDesignIntent(),
    touchedFieldPaths: row.touchedFieldPaths,
  }
}

// Gate 2 lives in the contract module so the review UI and this command share
// one implementation rather than two that a test has to keep in agreement.
export { unreviewedFieldPaths }


/**
 * Carries the reviewed intent into the fields the pricing engine, validation
 * rules, and every export already read. Only non-empty values overwrite, so an
 * import never blanks something the builder set by hand.
 */
function poolFieldsFromIntent(existing: unknown, intent: DesignIntent): PoolFields {
  const fields = readPoolFields(existing)
  const next: PoolFields = { ...fields }

  const assign = (key: keyof PoolFields, value: string | null): void => {
    if (value === null || value.trim() === '') return
    Object.assign(next, { [key]: value })
  }

  assign('interiorFinish', intent.materials.interiorFinish)
  assign('copingMaterial', intent.materials.copingMaterial)
  assign(
    'deckMaterial',
    intent.materials.deckMaterial ??
      (intent.deck.material === 'unknown' ? null : intent.deck.material),
  )
  assign('poolType', intent.pool.shapeFamily === 'unknown' ? null : intent.pool.shapeFamily)
  assign('depthShallow', intent.pool.depthShallowFt === null ? null : String(intent.pool.depthShallowFt))
  assign('depthDeep', intent.pool.depthDeepFt === null ? null : String(intent.pool.depthDeepFt))

  if (intent.enclosure.present && intent.enclosure.kind !== 'none') {
    next.screenSelected = true
    assign('screenOption', intent.enclosure.kind)
  }

  return next
}

/** Site observations are appended to the builder's notes, never substituted. */
function appendSiteNotes(existing: string | null, intent: DesignIntent): string | null {
  const lines = [...intent.site.notes, ...intent.warnings].filter(line => line.trim() !== '')
  if (lines.length === 0) return existing

  const block = ['Imported from image:', ...lines.map(line => `- ${line}`)].join('\n')
  return existing && existing.trim() !== '' ? `${existing}\n\n${block}` : block
}

register({
  id: 'import.session.create',
  label: 'Start image import',
  description:
    'Open an import session: the reviewable unit that spans every image in one ingestion and holds the extracted design intent.',
  category: 'import',
  inputSchema: z.object({
    projectId: z.string().min(1).optional(),
    sourceImageIds: z.array(z.string().min(1)).optional(),
  }),
  outputSchema: sessionOutput,
  voiceExamples: [
    'Start an import from a sketch.',
    'Import a site plan into this project.',
  ],
  execute: async (input, ctx): Promise<CommandResult<SessionOutput>> => {
    const unauthenticated = notAuthenticated<SessionOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')

    if (input.projectId) {
      const project = await db.project.findFirst({
        where: { id: input.projectId, orgId: ctx.orgId },
        select: { id: true },
      })
      if (!project) return { ok: false, error: 'Project not found' }
    }

    // Only source images belonging to this org may seed a session.
    const requested = input.sourceImageIds ?? []
    let sourceImageIds: string[] = []
    if (requested.length > 0) {
      const rows = await db.sourceImage.findMany({
        where: { id: { in: requested }, orgId: ctx.orgId },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
      if (rows.length !== requested.length) {
        return { ok: false, error: 'One or more source images were not found' }
      }
      sourceImageIds = rows.map((r) => r.id)
    }

    const intent = emptyDesignIntent(sourceImageIds)
    const created = await db.importSession.create({
      data: {
        orgId: ctx.orgId,
        projectId: input.projectId ?? null,
        status: 'DRAFT',
        designIntentJson: intent as unknown as object,
        appliedCommandIds: [],
      },
      select: { id: true, status: true },
    })

    return { ok: true, data: { sessionId: created.id, status: created.status, intent } }
  },
})

register({
  id: 'import.image.upload',
  label: 'Upload source image',
  description:
    'Register uploaded bytes as a SourceImage: sha256 dedupe, magic-byte sniff, EXIF strip, downscale, thumbnail.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    // The route writes bytes to the BlobStore and passes the resulting key;
    // command inputs stay JSON-serialisable so voice and macros can replay them.
    storageKey: z.string().min(1),
    mimeType: z.string().min(1),
    bytes: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    widthPx: z.number().int().positive(),
    heightPx: z.number().int().positive(),
    origin: z.enum(['BUILDER', 'CUSTOMER_INTAKE']).optional(),
  }),
  outputSchema: z.object({
    sourceImageId: z.string(),
    deduped: z.boolean(),
  }),
  voiceExamples: ['Upload this sketch.', 'Add a site plan photo.'],
  // Track I1 (Ingest) owns the body: dedupe, EXIF strip, downscale, thumbnail.
  execute: async () => ({ ok: false, error: 'not implemented: track I1 (ingest)' }),
})

register({
  id: 'import.image.analyze',
  label: 'Analyze source image',
  description:
    'Run classify and extract over a source image, writing one ImageAnalysis row per stage. Idempotent and cached on (sourceImageId, stage, extractorVersion).',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    sourceImageId: z.string().min(1),
    extractorVersion: z.string().min(1).optional(),
    force: z.boolean().optional(),
  }),
  outputSchema: z.object({
    sourceImageId: z.string(),
    cached: z.boolean(),
    intent: DesignIntentSchema,
  }),
  voiceExamples: ['Analyze the sketch.', 'Read the dimensions off this plan.'],
  // Track I2 (Extraction) owns the body: Vertex client, classifier, extractors.
  execute: async () => ({ ok: false, error: 'not implemented: track I2 (extraction)' }),
})

register({
  id: 'import.calibrate.set',
  label: 'Set image scale',
  description:
    'Set the pixels-per-inch scale for an import session. The manual two-point fallback when no grid, labeled dimension, or scale bar was resolved.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    pixelsPerInch: z.number().positive(),
    method: ScaleMethodSchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  outputSchema: sessionOutput,
  voiceExamples: [
    'Calibrate this drawing: one square is one foot.',
    'Set the scale from these two points.',
  ],
  execute: async (input, ctx): Promise<CommandResult<SessionOutput>> => {
    const unauthenticated = notAuthenticated<SessionOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const intent: DesignIntent = {
      ...loaded.intent,
      scale: {
        pixelsPerInch: input.pixelsPerInch,
        method: input.method ?? 'manual',
        confidence: input.confidence ?? 1,
      },
    }

    const { db } = await import('@/lib/db')
    const updated = await db.importSession.update({
      where: { id: loaded.id },
      data: { designIntentJson: intent as unknown as object },
      select: { id: true, status: true },
    })

    return { ok: true, data: { sessionId: updated.id, status: updated.status, intent } }
  },
})

register({
  id: 'import.intent.patch',
  label: 'Edit extracted design',
  description:
    'Apply a human correction to the extracted design intent. Every edit is a command so the audit log records exactly what the model got wrong.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    patch: DesignIntentPatchSchema,
  }),
  outputSchema: sessionOutput.extend({
    touchedPaths: z.array(z.string()),
  }),
  voiceExamples: [
    'The pool is thirty-two feet, not thirty-four.',
    'Change the deck material to travertine.',
  ],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<SessionOutput & { touchedPaths: string[] }>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const intent = applyIntentPatch(loaded.intent, input.patch)
    const paths = touchedPaths(input.patch)
    const merged = [...new Set([...loaded.touchedFieldPaths, ...paths])].sort()

    const { db } = await import('@/lib/db')
    const updated = await db.importSession.update({
      where: { id: loaded.id },
      data: {
        designIntentJson: intent as unknown as object,
        touchedFieldPaths: merged,
      },
      select: { id: true, status: true },
    })

    return {
      ok: true,
      data: {
        sessionId: updated.id,
        status: updated.status,
        intent,
        touchedPaths: paths,
      },
    }
  },
})

register({
  id: 'import.intent.apply',
  label: 'Apply imported design',
  description:
    'Write the reviewed design intent into the project as shapes, pool fields, and notes. Transactional, one undo entry, one audit row.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
    projectId: z.string().min(1),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    projectId: z.string(),
    appliedCommandIds: z.array(z.string()),
    createdShapeIds: z.array(z.string()),
  }),
  voiceExamples: ['Apply the imported design.', 'Build this into the project.'],
  execute: async (input, ctx) => {
    type ApplyOutput = {
      sessionId: string
      projectId: string
      appliedCommandIds: string[]
      createdShapeIds: string[]
    }

    const unauthenticated = notAuthenticated<ApplyOutput>(ctx)
    if (unauthenticated) return unauthenticated

    const loaded = await loadSession(input.sessionId, ctx)
    if (!loaded.ok) return { ok: false, error: loaded.error }

    const { intent, touchedFieldPaths } = loaded

    // Gate 1. Without a resolved scale every dimension is a guess, and a pool
    // that looks right but measures wrong is worse than no pool at all.
    if (!hasResolvedScale(intent)) {
      return {
        ok: false,
        error: 'Scale is not calibrated yet, so no geometry can be applied. Calibrate the image first.',
      }
    }

    // Gate 2. Anything the extractor was unsure about needs a human first.
    const unreviewed = unreviewedFieldPaths(intent, touchedFieldPaths)
    if (unreviewed.length > 0) {
      return {
        ok: false,
        error: `${unreviewed.length} field${unreviewed.length === 1 ? '' : 's'} still need review: ${unreviewed.join(', ')}`,
      }
    }

    const { shapes: newShapes, warnings } = intentToShapes(intent)
    if (newShapes.length === 0) {
      return { ok: false, error: 'The reviewed design has nothing to apply yet.' }
    }

    const { db } = await import('@/lib/db')

    const project = await db.project.findFirst({
      where: { id: input.projectId, orgId: ctx.orgId },
      select: { id: true, poolFields: true, internalNotes: true },
    })
    if (!project) return { ok: false, error: 'Project not found' }

    const drawing = await db.drawing.findUnique({
      where: { projectId: project.id },
      select: { rootJson: true },
    })
    const payload = parseDrawingPayload(drawing?.rootJson ?? { shapes: [], survey: null })

    // Appended, never replacing. An import adds to whatever the builder has
    // already drawn; silently discarding their work would be unrecoverable.
    const merged = { ...payload, shapes: [...payload.shapes, ...newShapes] }
    const poolFields = poolFieldsFromIntent(project.poolFields, intent)
    const notes = appendSiteNotes(project.internalNotes, intent)

    await db.$transaction([
      db.drawing.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          scale: 1,
          rootJson: serializeDrawingPayload(merged) as unknown as object,
        },
        update: { rootJson: serializeDrawingPayload(merged) as unknown as object },
      }),
      db.project.update({
        where: { id: project.id },
        data: { poolFields: poolFields as unknown as object, internalNotes: notes },
      }),
      db.importSession.update({
        where: { id: loaded.id },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
          projectId: project.id,
          appliedCommandIds: ['import.intent.apply'],
        },
      }),
    ])

    if (warnings.length > 0) {
      console.warn('[import.intent.apply] translation warnings', {
        sessionId: loaded.id,
        warnings,
      })
    }

    return {
      ok: true,
      data: {
        sessionId: loaded.id,
        projectId: project.id,
        appliedCommandIds: ['import.intent.apply'],
        createdShapeIds: newShapes.map(shape => shape.id),
      },
    }
  },
})

register({
  id: 'import.session.discard',
  label: 'Discard image import',
  description: 'Abandon an import session without writing anything into the project.',
  category: 'import',
  inputSchema: z.object({
    sessionId: z.string().min(1),
  }),
  outputSchema: z.object({
    sessionId: z.string(),
    status: z.enum(['DRAFT', 'READY', 'APPLIED', 'DISCARDED']),
  }),
  voiceExamples: ['Discard this import.', 'Cancel the import.'],
  execute: async (input, ctx) => {
    const unauthenticated = notAuthenticated<{
      sessionId: string
      status: 'DRAFT' | 'READY' | 'APPLIED' | 'DISCARDED'
    }>(ctx)
    if (unauthenticated) return unauthenticated

    const { db } = await import('@/lib/db')
    const existing = await db.importSession.findFirst({
      where: { id: input.sessionId, orgId: ctx.orgId },
      select: { id: true, status: true },
    })
    if (!existing) return { ok: false, error: 'Import session not found' }
    if (existing.status === 'APPLIED') {
      return { ok: false, error: 'An applied import cannot be discarded' }
    }

    const updated = await db.importSession.update({
      where: { id: existing.id },
      data: { status: 'DISCARDED' },
      select: { id: true, status: true },
    })

    return { ok: true, data: { sessionId: updated.id, status: updated.status } }
  },
})
