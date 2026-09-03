import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProjectDetail } from '@/components/project/detail/ProjectDetail'
import type { ProjectDetailData } from '@/components/project/detail/types'
import type {
  PriceBookChoice,
  ProjectLineItemView,
} from '@/components/project/ProjectLineItems'
import { listVersions } from '@/modules/versions'
import { listMembers } from '@/modules/invites/team'
import { readPoolFields } from '@/modules/projects/pool-fields'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { mapsEnabled } from '@/modules/site/geo/google'
import type { Shape } from '@/modules/editor/state/shapes'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params

  // Org-scoped in the query, not fetched-then-checked: a project from another
  // organisation is not found rather than found and refused.
  const project = await db.project.findFirst({
    where: { id, orgId },
    include: { customer: true },
  })
  if (!project) notFound()

  const pool = readPoolFields(project.poolFields)

  // Everything else this page needs is independent of the project row, so the
  // reads run together rather than in a serial chain: the priced view (shapes,
  // measurements, quote, line items, price book — the same loader every export
  // reads, so the header figure is the proposal figure), the design summaries,
  // and the team roster for the salesperson/designer pickers. The version
  // drawings are no longer loaded here; the rack fetches each as it scrolls to
  // it, so first paint does not ship up to forty full drawings.
  const [quote, versionRows, members] = await Promise.all([
    loadProjectQuote(project.id, orgId),
    listVersions(orgId, project.id),
    listMembers(orgId),
  ])

  const measurements = quote?.measurements ?? null
  const shapes: Shape[] = quote?.shapes ?? []
  const depth =
    measurements &&
    measurements.hasPool &&
    measurements.poolDepthShallow > 0 &&
    measurements.poolDepthDeep > 0
      ? { shallowFt: measurements.poolDepthShallow, deepFt: measurements.poolDepthDeep }
      : null

  const versions = versionRows.map(row => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))

  // Amounts put on this job by hand, already loaded by the quote; the price
  // book choices give the add dialog the builder's own rates to start from.
  const lineItems: ProjectLineItemView[] = (quote?.projectLineItems ?? []).map(row => ({
    id: row.id,
    category: row.category,
    name: row.name,
    unitType: row.unitType,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    note: row.note ?? null,
  }))
  const priceBookChoices: PriceBookChoice[] = (quote?.items ?? [])
    .map(item => ({
      id: item.id,
      category: item.category,
      name: item.name,
      unitType: item.unitType,
      retailPrice: item.retailPrice,
    }))
    .sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    )

  // Fixed decision 2, applied lazily at read time: the geocoded site address
  // is canonical, and the customer's free-text address survives only as a
  // billing address when it says something different. The next save writes
  // the split back, which migrates rows as they are touched.
  const customerAddress = project.customer?.address ?? ''
  const siteAddress = project.siteAddress ?? customerAddress
  const billingAddress =
    project.siteAddress && customerAddress && customerAddress !== project.siteAddress
      ? customerAddress
      : ''

  const data: ProjectDetailData = {
    projectId: project.id,
    jobNumber: project.jobNumber,
    status: project.status,
    initial: {
      name: project.name,
      salesperson: project.salesperson ?? '',
      designer: project.designer ?? '',
      proposalExpiresAt: project.proposalExpiresAt
        ? project.proposalExpiresAt.toISOString().slice(0, 10)
        : '',
      internalNotes: project.internalNotes ?? '',
      jurisdiction: project.jurisdiction ?? '',
      parcelId: project.parcelId ?? '',
      siteAddress,
      sitePlaceId: project.sitePlaceId,
      latitude: project.latitude,
      longitude: project.longitude,
      customerName: project.customer?.name ?? '',
      customerEmail: project.customer?.email ?? '',
      customerPhone: project.customer?.phone ?? '',
      billingAddress,
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
    },
    depth,
    hasShapes: shapes.length > 0,
    hasPool: measurements?.hasPool ?? false,
    quote: {
      status: quote?.quote.status ?? 'NOTHING_DRAWN',
      total: quote?.quote.total ?? 0,
    },
    memberNames: members.map(m => m.name?.trim() || m.email),
    versions,
    lineItems,
    priceBookChoices,
    share: {
      token: project.shareToken,
      accepted: project.proposalAcceptedAt
        ? {
            name: project.proposalAcceptedName ?? 'Customer',
            at: project.proposalAcceptedAt.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          }
        : null,
    },
    mapsEnabled: mapsEnabled(),
  }

  return <ProjectDetail data={data} />
}
