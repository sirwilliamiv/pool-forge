import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { EditorLayout } from '@/components/editor/shell/EditorLayout'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import {
  computeQuote,
  type PriceBookItemLite,
  type PricingSelections,
} from '@/modules/pricing/engine'
import { runValidation } from '@/modules/validation/engine'
import type {
  ValidationContext,
  ValidationProject,
  ValidationReport,
  ValidationSelections,
} from '@/modules/validation/types'
import { getSuggestions } from '@/lib/commands/suggestions'

function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1
}

function asNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export default async function ProjectEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      orgId: true,
      poolFields: true,
      proposalExpiresAt: true,
      org: { select: { name: true } },
      customer: { select: { name: true, address: true } },
    },
  })
  if (!project || project.orgId !== orgId) notFound()

  let initial: { shapes: never[] } | Awaited<ReturnType<typeof loadDrawing>>
  try {
    initial = await loadDrawing(project.id)
  } catch (err) {
    console.error('loadDrawing failed', err)
    initial = { shapes: [] }
  }

  const poolFields =
    project.poolFields && typeof project.poolFields === 'object' && !Array.isArray(project.poolFields)
      ? (project.poolFields as Record<string, unknown>)
      : {}

  const validationProject: ValidationProject = {
    name: project.name,
    customerName: project.customer?.name ?? null,
    address: project.customer?.address ?? null,
    poolFields,
    proposalExpiresAt: project.proposalExpiresAt ? project.proposalExpiresAt.toISOString() : null,
  }

  // Compute measurements + quote + validation server-side. The dock components
  // are read-only views over these snapshots in v1.
  const measurements = computeMeasurements(initial.shapes ?? [])

  const priceBook = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    include: { items: true },
  })
  const items: PriceBookItemLite[] = priceBook
    ? priceBook.items.map((i) => ({
        id: i.id,
        category: i.category,
        name: i.name,
        unitType: i.unitType,
        retailPrice: Number(i.retailPrice),
      }))
    : []

  const pricingSelections: PricingSelections = {
    heaterSelected: asBool(poolFields.heaterSelected),
    saltSystemSelected: asBool(poolFields.saltSystemSelected),
    screenSelected: asBool(poolFields.screenSelected),
    lightingQuantity: asNumber(poolFields.lightingQuantity),
  }

  const quoteSummary = computeQuote(items, measurements, pricingSelections)
  const quoteDock = quoteSummary.lineItems.length
    ? {
        id: project.id,
        subtotal: quoteSummary.subtotal,
        total: quoteSummary.total,
        delta: 0,
        lineItems: quoteSummary.lineItems.map((l) => ({
          id: l.itemId,
          name: l.name,
          source: l.source,
          total: l.total,
        })),
      }
    : null

  const validationSelections: ValidationSelections = {
    heaterSelected: asBool(poolFields.heaterSelected),
    saltSelected: asBool(poolFields.saltSystemSelected),
    screenSelected: asBool(poolFields.screenSelected),
    lightingQuantity: asNumber(poolFields.lightingQuantity),
  }

  const validationContext: ValidationContext = {
    project: validationProject,
    measurements,
    selections: validationSelections,
    shapeCount: initial.shapes?.length ?? 0,
    hasDeck: measurements.hasDeck,
  }
  const validationReport: ValidationReport = runValidation(validationContext)

  const paletteSuggestions = await getSuggestions({ projectId: project.id })

  const materialRows = await db.material.findMany({
    where: { OR: [{ orgId }, { orgId: null }] },
    select: { id: true, kind: true, name: true, fillSpec: true },
    orderBy: [{ kind: 'asc' }, { name: 'asc' }],
  })
  const materials = materialRows.map((m) => ({
    id: m.id,
    kind: m.kind as
      | 'POOL_WATER'
      | 'CONCRETE_DECK'
      | 'PAVER_DECK'
      | 'GRASS'
      | 'COPING'
      | 'SCREEN'
      | 'LANAI'
      | 'CUSTOM',
    name: m.name,
    fillSpec: m.fillSpec,
  }))

  return (
    <EditorLayout
      projectId={project.id}
      projectName={project.name}
      customerName={project.customer?.name ?? null}
      orgName={project.org?.name ?? null}
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
      initial={initial}
      validationReport={validationReport}
      quoteDock={quoteDock}
      inspectorQuote={quoteSummary}
      paletteSuggestions={paletteSuggestions}
      materials={materials}
    />
  )
}
