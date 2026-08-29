import Link from 'next/link'
import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import type { ProjectStatus, Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProjectForm } from '@/components/project/ProjectForm'
import { ProjectActions } from '@/components/project/ProjectActions'
import { ShareProposalCard } from '@/components/project/ShareProposalCard'
import { VersionsCard } from '@/components/versions/VersionsCard'
import { listVersions } from '@/modules/versions'
import {
  ProjectLineItems,
  type PriceBookChoice,
  type ProjectLineItemView,
} from '@/components/project/ProjectLineItems'
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

  // The designs tried on this job. Shapes come out of each version's own
  // payload so a card draws the design it names, rather than a thumbnail that
  // was accurate the day it was rendered.
  const versionRows = await listVersions(orgId, project.id)
  const versionPayloads = await db.designVersion.findMany({
    where: { projectId: project.id, orgId },
    select: { id: true, rootJson: true },
  })
  const shapesByVersion = new Map(
    versionPayloads.map(row => [
      row.id,
      ((row.rootJson as { shapes?: unknown } | null)?.shapes ?? []) as Shape[],
    ]),
  )
  const versions = versionRows.map(row => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    shapes: shapesByVersion.get(row.id) ?? [],
  }))

  // Amounts put on this job by hand, and the builder's own rates to start from.
  // Both are org-scoped: the project id already implies the organisation, and
  // asking for both means nothing here can read another org's numbers.
  const [lineItemRows, priceBookRows] = await Promise.all([
    db.projectLineItem.findMany({
      where: { projectId: project.id, orgId },
      select: {
        id: true,
        category: true,
        name: true,
        unitType: true,
        quantity: true,
        unitPrice: true,
        note: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.priceBookItem.findMany({
      where: { priceBook: { orgId, isActive: true } },
      select: { id: true, category: true, name: true, unitType: true, retailPrice: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    }),
  ])
  const lineItems: ProjectLineItemView[] = lineItemRows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    unitType: row.unitType,
    quantity: Number(row.quantity),
    unitPrice: Number(row.unitPrice),
    note: row.note,
  }))
  const priceBookChoices: PriceBookChoice[] = priceBookRows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    unitType: row.unitType,
    retailPrice: Number(row.retailPrice),
  }))

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
    <div className="container space-y-8 py-10 bg-theme-bg text-theme-fg" data-accent="azure">
      <div className="space-y-1">
        <h1 className="text-title2 font-medium text-theme-fg">{project.name}</h1>
        <p className="text-bodyS text-theme-muted">
          <Link
            href="/dashboard"
            className="hover:text-theme-fg transition-colors duration-brand ease-brand"
          >
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
      <VersionsCard projectId={project.id} versions={versions} />
      <ProjectLineItems
        projectId={project.id}
        items={lineItems}
        priceBookChoices={priceBookChoices}
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
