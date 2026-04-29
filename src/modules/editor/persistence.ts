'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import type { Shape } from '@/modules/editor/state/shapes'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'

const ShapeSchema: z.ZodType<Shape> = z.any()
const SurveySchema: z.ZodType<SurveyConfig> = z.any()

const DrawingPayloadSchema = z.object({
  shapes: z.array(ShapeSchema),
  survey: SurveySchema.nullable().optional(),
})

export interface DrawingPayload {
  shapes: Shape[]
  survey: SurveyConfig | null
}

async function requireOrg(): Promise<{ userId: string; orgId: string }> {
  const session = await auth()
  if (!session?.user?.id || !session.user.orgId) {
    throw new Error('Not authenticated')
  }
  return { userId: session.user.id, orgId: session.user.orgId }
}

export async function loadDrawing(projectId: string): Promise<DrawingPayload> {
  const { orgId } = await requireOrg()
  const project = await db.project.findFirst({
    where: { id: projectId, orgId },
    include: { drawing: true },
  })
  if (!project) throw new Error('Project not found')

  if (!project.drawing) {
    const fresh = await db.drawing.create({
      data: { projectId, scale: 1, rootJson: { shapes: [], survey: null } },
    })
    return parsePayload(fresh.rootJson)
  }
  return parsePayload(project.drawing.rootJson)
}

export async function saveDrawing(
  projectId: string,
  payload: DrawingPayload,
): Promise<{ ok: true }> {
  const { orgId } = await requireOrg()
  const parsed = DrawingPayloadSchema.parse(payload)

  const project = await db.project.findFirst({ where: { id: projectId, orgId } })
  if (!project) throw new Error('Project not found')

  await db.drawing.upsert({
    where: { projectId },
    create: {
      projectId,
      scale: 1,
      rootJson: parsed as unknown as object,
    },
    update: {
      rootJson: parsed as unknown as object,
    },
  })
  return { ok: true }
}

function parsePayload(raw: unknown): DrawingPayload {
  if (!raw || typeof raw !== 'object') return { shapes: [], survey: null }
  const obj = raw as { shapes?: unknown; survey?: unknown }
  const shapes = Array.isArray(obj.shapes) ? (obj.shapes as Shape[]) : []
  const survey = obj.survey && typeof obj.survey === 'object' ? (obj.survey as SurveyConfig) : null
  return { shapes, survey }
}
