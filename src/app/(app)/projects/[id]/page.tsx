import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { ProjectStatus, Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProjectForm } from '@/components/project/ProjectForm'
import { ProjectActions } from '@/components/project/ProjectActions'

type PoolFields = {
  poolType?: string
  depthShallow?: string
  depthDeep?: string
  interiorFinish?: string
  equipmentPackage?: string
  sanitizationPackage?: string
  heaterSelection?: string
  lightingSelection?: string
  deckMaterial?: string
  copingMaterial?: string
  screenOption?: string
}

function readPoolFields(json: Prisma.JsonValue): PoolFields {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    return json as PoolFields
  }
  return {}
}

async function saveProjectAction(
  projectId: string,
  input: {
    name: string
    salesperson: string
    designer: string
    status: ProjectStatus
    proposalExpiresAt: string
    internalNotes: string
    customerName: string
    customerEmail: string
    customerPhone: string
    customerAddress: string
    customerNotes: string
    poolType: string
    depthShallow: string
    depthDeep: string
    interiorFinish: string
    equipmentPackage: string
    sanitizationPackage: string
    heaterSelection: string
    lightingSelection: string
    deckMaterial: string
    copingMaterial: string
    screenOption: string
  },
) {
  'use server'
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!session || !orgId) return { ok: false, error: 'Not authenticated' }

  const project = await db.project.findUnique({ where: { id: projectId }, select: { orgId: true, customerId: true } })
  if (!project || project.orgId !== orgId) return { ok: false, error: 'Project not found' }

  const poolFields: PoolFields = {
    poolType: input.poolType,
    depthShallow: input.depthShallow,
    depthDeep: input.depthDeep,
    interiorFinish: input.interiorFinish,
    equipmentPackage: input.equipmentPackage,
    sanitizationPackage: input.sanitizationPackage,
    heaterSelection: input.heaterSelection,
    lightingSelection: input.lightingSelection,
    deckMaterial: input.deckMaterial,
    copingMaterial: input.copingMaterial,
    screenOption: input.screenOption,
  }

  const projectData: Prisma.ProjectUpdateInput = {
    name: input.name,
    salesperson: input.salesperson || null,
    designer: input.designer || null,
    status: input.status,
    proposalExpiresAt: input.proposalExpiresAt ? new Date(input.proposalExpiresAt) : null,
    internalNotes: input.internalNotes || null,
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

  return { ok: true }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const project = await db.project.findUnique({ where: { id }, include: { customer: true } })
  if (!project || project.orgId !== orgId) notFound()

  const pool = readPoolFields(project.poolFields)
  const initial = {
    name: project.name,
    salesperson: project.salesperson ?? '',
    designer: project.designer ?? '',
    status: project.status,
    proposalExpiresAt: project.proposalExpiresAt ? project.proposalExpiresAt.toISOString().slice(0, 10) : '',
    internalNotes: project.internalNotes ?? '',
    customerName: project.customer?.name ?? '',
    customerEmail: project.customer?.email ?? '',
    customerPhone: project.customer?.phone ?? '',
    customerAddress: project.customer?.address ?? '',
    customerNotes: project.customer?.notes ?? '',
    poolType: pool.poolType ?? '',
    depthShallow: pool.depthShallow ?? '',
    depthDeep: pool.depthDeep ?? '',
    interiorFinish: pool.interiorFinish ?? '',
    equipmentPackage: pool.equipmentPackage ?? '',
    sanitizationPackage: pool.sanitizationPackage ?? '',
    heaterSelection: pool.heaterSelection ?? '',
    lightingSelection: pool.lightingSelection ?? '',
    deckMaterial: pool.deckMaterial ?? '',
    copingMaterial: pool.copingMaterial ?? '',
    screenOption: pool.screenOption ?? '',
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
      <ProjectForm projectId={project.id} initial={initial} saveAction={saveProjectAction} />
    </div>
  )
}
