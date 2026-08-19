'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import type { Shape } from '@/modules/editor/state/shapes'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'
import {
  parseDrawingPayload,
  serializeDrawingPayload,
  type DrawingPayload,
} from '@/modules/editor/drawing-payload'

const ShapeSchema: z.ZodType<Shape> = z.any()
const SurveySchema: z.ZodType<SurveyConfig> = z.any()

const DrawingPayloadSchema = z.object({
  shapes: z.array(ShapeSchema),
  survey: SurveySchema.nullable().optional(),
})

export type { DrawingPayload }

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
    return parseDrawingPayload(fresh.rootJson)
  }
  return parseDrawingPayload(project.drawing.rootJson)
}

export async function saveDrawing(
  projectId: string,
  payload: DrawingPayload,
): Promise<{ ok: true }> {
  const { orgId } = await requireOrg()
  DrawingPayloadSchema.parse(payload)
  const serialized = serializeDrawingPayload(payload)

  const project = await db.project.findFirst({ where: { id: projectId, orgId } })
  if (!project) throw new Error('Project not found')

  await db.drawing.upsert({
    where: { projectId },
    create: {
      projectId,
      scale: 1,
      rootJson: serialized as unknown as object,
    },
    update: {
      rootJson: serialized as unknown as object,
    },
  })
  return { ok: true }
}
