'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ProjectStatus } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { nextJobNumber } from '@/modules/projects/job-number'

const StatusSchema = z.nativeEnum(ProjectStatus)

async function requireOrg(): Promise<{ orgId: string; userId: string }> {
  const session = await auth()
  if (!session?.user?.id || !session.user.orgId) {
    throw new Error('Not authenticated')
  }
  return { orgId: session.user.orgId, userId: session.user.id }
}

async function assertOwned(id: string, orgId: string): Promise<void> {
  const project = await db.project.findUnique({ where: { id }, select: { orgId: true } })
  if (!project || project.orgId !== orgId) throw new Error('Project not found')
}

export async function deleteProject(id: string): Promise<{ ok: true }> {
  const { orgId } = await requireOrg()
  await assertOwned(id, orgId)
  await db.project.delete({ where: { id } })
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${id}`)
  return { ok: true }
}

export async function updateProjectStatus(
  id: string,
  status: ProjectStatus,
): Promise<{ ok: true }> {
  const { orgId } = await requireOrg()
  const parsed = StatusSchema.parse(status)
  await assertOwned(id, orgId)
  await db.project.update({ where: { id }, data: { status: parsed } })
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${id}`)
  return { ok: true }
}

export async function archiveProject(id: string): Promise<{ ok: true }> {
  return updateProjectStatus(id, ProjectStatus.ARCHIVED)
}

export async function duplicateProject(id: string): Promise<{ ok: true; id: string }> {
  const { orgId } = await requireOrg()
  await assertOwned(id, orgId)

  const source = await db.project.findUnique({
    where: { id },
    include: { customer: true, drawing: true },
  })
  if (!source) throw new Error('Project not found')

  const newId = await db.$transaction(async (tx) => {
    const projectData: Prisma.ProjectCreateInput = {
      org: { connect: { id: orgId } },
      name: `${source.name} (Copy)`,
      status: ProjectStatus.DRAFT,
      poolFields: source.poolFields as unknown as Prisma.InputJsonValue,
      // A copy is a different job and gets its own number. Carrying the
      // original's over would put two projects on one reference, which is the
      // one thing a job number must never do.
      jobNumber: await nextJobNumber(tx, orgId),
    }
    if (source.salesperson) projectData.salesperson = source.salesperson
    if (source.designer) projectData.designer = source.designer
    if (source.internalNotes) projectData.internalNotes = source.internalNotes

    if (source.customer) {
      projectData.customer = {
        connect: { id: source.customer.id },
      }
    }

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

  revalidatePath('/dashboard')
  return { ok: true, id: newId }
}
