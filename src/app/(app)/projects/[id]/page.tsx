import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import type { ProjectStatus, Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProjectForm } from '@/components/project/ProjectForm'
import { ProjectActions } from '@/components/project/ProjectActions'
import { ShareProposalCard } from '@/components/project/ShareProposalCard'
import { poolFieldsSchema, readPoolFields } from '@/modules/projects/pool-fields'
import { computeMeasurements } from '@/modules/measurements/engine'
import type { Shape } from '@/modules/editor/state/shapes'

async function saveProjectAction(
  projectId: string,
  input: {
    name: string
    salesperson: string
    designer: string
    status: ProjectStatus
    proposalExpiresAt: string
    internalNotes: string
    jurisdiction: string
    parcelId: string
    customerName: string
    customerEmail: string
    customerPhone: string
    customerAddress: string
    customerNotes: string
    poolType: string
    interiorFinish: string
    equipmentPackage: string
    sanitizationPackage: string
    heaterSelection: string
    lightingSelection: string
    deckMaterial: string
    copingMaterial: string
    screenOption: string
    heaterSelected: boolean
    saltSystemSelected: boolean
    screenSelected: boolean
    lightingQuantity: number
  },
) {
  'use server'
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!session || !orgId) return { ok: false, error: 'Not authenticated' }

  const project = await db.project.findUnique({ where: { id: projectId }, select: { orgId: true, customerId: true } })
  if (!project || project.orgId !== orgId) return { ok: false, error: 'Project not found' }

  const poolFields = poolFieldsSchema.parse({
    poolType: input.poolType,
    interiorFinish: input.interiorFinish,
    equipmentPackage: input.equipmentPackage,
    sanitizationPackage: input.sanitizationPackage,
    heaterSelection: input.heaterSelection,
    lightingSelection: input.lightingSelection,
    deckMaterial: input.deckMaterial,
    copingMaterial: input.copingMaterial,
    screenOption: input.screenOption,
    heaterSelected: input.heaterSelected,
    saltSystemSelected: input.saltSystemSelected,
    screenSelected: input.screenSelected,
    lightingQuantity: input.lightingQuantity,
  })

  const projectData: Prisma.ProjectUpdateInput = {
    name: input.name,
    salesperson: input.salesperson || null,
    designer: input.designer || null,
    status: input.status,
    proposalExpiresAt: input.proposalExpiresAt ? new Date(input.proposalExpiresAt) : null,
    internalNotes: input.internalNotes || null,
    // Permit facts, on their own columns. The site plan reads these; it used to
    // read JSON keys that no writer ever wrote, and printed a dash for both.
    jurisdiction: input.jurisdiction.trim() || null,
    parcelId: input.parcelId.trim() || null,
    poolFields: poolFields as unknown as Prisma.InputJsonValue,
  }

  await db.$transaction(async (tx) => {
    let customerId = project.customerId
    if (input.customerName.trim()) {
      const customerData = {
        name: input.customerName.trim(),
        email: input.customerEmail || null,
        phone: input.customerPhone || null,
        address: input.customerAddress || null,
        notes: input.customerNotes || null,
      }
      if (customerId) {
        await tx.customer.update({ where: { id: customerId }, data: customerData })
      } else {
        const created = await tx.customer.create({ data: { orgId, ...customerData } })
        customerId = created.id
      }
    }
    await tx.project.update({
      where: { id: projectId },
      data: customerId ? { ...projectData, customer: { connect: { id: customerId } } } : projectData,
    })
  })

  // Without this the dashboard and the project's own header keep serving a
  // cached name. It happens to look fine in dev, where there is no full route
  // cache, and would be stale in production.
  revalidatePath('/dashboard')
  revalidatePath(`/projects/${projectId}`)

  return { ok: true }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const project = await db.project.findUnique({
    where: { id },
    include: { customer: true, drawing: { select: { rootJson: true } } },
  })
  if (!project || project.orgId !== orgId) notFound()

  const pool = readPoolFields(project.poolFields)

  // Depth is read from the drawing, because the drawing is where it lives. The
  // form used to ask for it again in two free-text boxes that priced nothing
  // and printed nowhere, so one pool could report three different depths: the
  // typed pair, the canvas geometry the proposal printed, and the checklist
  // complaining the canvas pair was missing.
  const root = project.drawing?.rootJson
  const shapes: Shape[] =
    root && typeof root === 'object' && Array.isArray((root as { shapes?: unknown }).shapes)
      ? (root as unknown as { shapes: Shape[] }).shapes
      : []
  const measurements = computeMeasurements(shapes)
  const depth =
    measurements.hasPool && measurements.poolDepthShallow > 0 && measurements.poolDepthDeep > 0
      ? { shallowFt: measurements.poolDepthShallow, deepFt: measurements.poolDepthDeep }
      : null
  const initial = {
    name: project.name,
    salesperson: project.salesperson ?? '',
    designer: project.designer ?? '',
    status: project.status,
    proposalExpiresAt: project.proposalExpiresAt ? project.proposalExpiresAt.toISOString().slice(0, 10) : '',
    internalNotes: project.internalNotes ?? '',
    jurisdiction: project.jurisdiction ?? '',
    parcelId: project.parcelId ?? '',
    customerName: project.customer?.name ?? '',
    customerEmail: project.customer?.email ?? '',
    customerPhone: project.customer?.phone ?? '',
    customerAddress: project.customer?.address ?? '',
    customerNotes: project.customer?.notes ?? '',
    poolType: pool.poolType ?? '',
    interiorFinish: pool.interiorFinish ?? '',
    equipmentPackage: pool.equipmentPackage ?? '',
    sanitizationPackage: pool.sanitizationPackage ?? '',
    heaterSelection: pool.heaterSelection ?? '',
    lightingSelection: pool.lightingSelection ?? '',
    deckMaterial: pool.deckMaterial ?? '',
    copingMaterial: pool.copingMaterial ?? '',
    screenOption: pool.screenOption ?? '',
    heaterSelected: pool.heaterSelected,
    saltSystemSelected: pool.saltSystemSelected,
    screenSelected: pool.screenSelected,
    lightingQuantity: pool.lightingQuantity,
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Back to projects
          </Link>
        </p>
      </div>
      <ProjectActions
        project={{ id: project.id, name: project.name, status: project.status }}
      />
      <ShareProposalCard
        projectId={project.id}
        initialToken={project.shareToken}
        accepted={
          project.proposalAcceptedAt
            ? {
                name: project.proposalAcceptedName ?? 'Customer',
                at: project.proposalAcceptedAt.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                }),
              }
            : null
        }
      />
      <ProjectForm
        projectId={project.id}
        initial={initial}
        depth={depth}
        saveAction={saveProjectAction}
      />
    </div>
  )
}
