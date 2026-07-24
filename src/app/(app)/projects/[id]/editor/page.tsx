import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { EditorLayout } from '@/components/editor/shell/EditorLayout'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, toPriceBookItems } from '@/modules/pricing/engine'
import {
  pricingSelectionsFrom,
  validationSelectionsFrom,
} from '@/modules/projects/pool-fields'
import { runValidation } from '@/modules/validation/engine'
import type {
  ValidationContext,
  ValidationProject,
  ValidationReport,
} from '@/modules/validation/types'
import { getSuggestions } from '@/lib/commands/suggestions'
import {
  loadCachedQuote,
  loadCachedValidation,
  writeCachedQuote,
  writeCachedValidation,
} from '@/lib/cache/editor'

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
      org: { select: { name: true, taxRatePct: true } },
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
  const items = toPriceBookItems(priceBook?.items ?? [])
  const pricingSelections = pricingSelectionsFrom(poolFields)

  // Cache-first read; fall back to compute and fire-and-forget write. Tax comes
  // from the org so the dock total matches the proposal total.
  const cachedQuote = await loadCachedQuote(project.id)
  const quoteSummary =
    cachedQuote ??
    computeQuote(items, measurements, pricingSelections, {
      taxRatePct: project.org?.taxRatePct ?? 0,
    })
  if (!cachedQuote && priceBook && quoteSummary.lineItems.length) {
    void writeCachedQuote(project.id, priceBook.id, quoteSummary).catch((err) =>
      console.error('writeCachedQuote miss-write failed', err),
    )
  }
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

  const validationContext: ValidationContext = {
    project: validationProject,
    measurements,
    selections: validationSelectionsFrom(poolFields),
    shapeCount: initial.shapes?.length ?? 0,
    hasDeck: measurements.hasDeck,
  }
  const cachedValidation = await loadCachedValidation(project.id)
  const validationReport: ValidationReport =
    cachedValidation ?? runValidation(validationContext)
  if (!cachedValidation) {
    void writeCachedValidation(project.id, validationReport).catch((err) =>
      console.error('writeCachedValidation miss-write failed', err),
    )
  }

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
