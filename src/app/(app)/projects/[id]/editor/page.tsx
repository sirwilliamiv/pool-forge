import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { EditorLayout } from '@/components/editor/shell/EditorLayout'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { EMPTY_FINISH_CATALOG } from '@/modules/materials/catalog'
import { validationSelectionsFrom } from '@/modules/projects/pool-fields'
import { runValidation } from '@/modules/validation/engine'
import type {
  ValidationContext,
  ValidationProject,
  ValidationReport,
} from '@/modules/validation/types'
import { getSuggestions } from '@/lib/commands/suggestions'
import { loadCachedValidation, writeCachedValidation } from '@/lib/cache/editor'

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

  // Compute measurements + quote + validation server-side. The dock components
  // are read-only views over these snapshots in v1.
  const measurements = computeMeasurements(initial.shapes ?? [])

  // Pricing inputs, not a pricing *result*: the dock recomputes in the browser
  // from the live shape store, through the same `computeQuote` the proposal
  // runs. The editor previously rendered a cached quote written at the last
  // save, which is why widening a pool moved the surface area and not the
  // price, and why the dock and the proposal could disagree by $1,350.
  const priced = await loadProjectQuote(project.id, orgId)
  // A job with no price book but a hand-entered amount on it still has a price,
  // so the dock gets its inputs. Gating on the catalogue alone would blank the
  // dock for a builder whose only money so far is a $9,400 retaining wall.
  const pricing =
    priced && (priced.items.length > 0 || priced.projectLineItems.length > 0)
      ? { items: priced.items, selections: priced.selections, taxRatePct: priced.taxRatePct }
      : null

  // The loader's pool fields, not the raw column: they carry the finishes the
  // drawing actually has. Reading the column here instead is how the checklist
  // came to warn "select a pool interior finish" about a pool that had one.
  const merged = priced?.poolFields ?? project.poolFields
  const poolFields =
    merged && typeof merged === 'object' && !Array.isArray(merged)
      ? (merged as Record<string, unknown>)
      : {}

  const validationProject: ValidationProject = {
    name: project.name,
    customerName: project.customer?.name ?? null,
    address: project.customer?.address ?? null,
    poolFields,
    proposalExpiresAt: project.proposalExpiresAt ? project.proposalExpiresAt.toISOString() : null,
  }

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
      pricing={pricing}
      paletteSuggestions={paletteSuggestions}
      finishCatalog={priced?.finishCatalog ?? EMPTY_FINISH_CATALOG}
    />
  )
}
