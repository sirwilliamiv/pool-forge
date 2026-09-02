import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProjectDetail } from '@/components/project/detail/ProjectDetail'
import {
  LAYOUTS,
  type LayoutId,
  type ProjectDetailData,
} from '@/components/project/detail/types'
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

/**
 * The layout under comparison. Anything unrecognised is layout 1, so a shared
 * or stale link never 404s over a prototype flag.
 */
function parseLayout(raw: string | string[] | undefined): LayoutId {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return n in LAYOUTS ? (n as LayoutId) : 1
}

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ layout?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const layout = parseLayout((await searchParams).layout)

  const project = await db.project.findUnique({
    where: { id },
    include: { customer: true },
  })
  if (!project || project.orgId !== orgId) notFound()

  const pool = readPoolFields(project.poolFields)

  // The one priced view of the project: shapes, measurements and the quote all
  // come from the same loader every export reads, so the header's figure is
  // the proposal's figure.
  const quote = await loadProjectQuote(project.id, orgId)
  const shapes: Shape[] = quote?.shapes ?? []
  const measurements = quote?.measurements ?? null
  const depth =
    measurements &&
    measurements.hasPool &&
    measurements.poolDepthShallow > 0 &&
    measurements.poolDepthDeep > 0
      ? { shallowFt: measurements.poolDepthShallow, deepFt: measurements.poolDepthDeep }
      : null

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

  const members = await listMembers(orgId)

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

  return <ProjectDetail data={data} layout={layout} />
}
