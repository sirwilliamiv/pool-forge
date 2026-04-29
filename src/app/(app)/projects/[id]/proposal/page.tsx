import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, type PriceBookItemLite, type PricingSelections } from '@/modules/pricing/engine'
import { ProposalDocument } from '@/components/exports/ProposalDocument'
import { PrintButton } from '@/components/exports/PrintButton'
import './proposal.css'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) return { title: 'Proposal' }
  const project = await db.project.findFirst({
    where: { id, orgId },
    select: { name: true },
  })
  return { title: project ? `Proposal — ${project.name}` : 'Proposal' }
}

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

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params

  const project = await db.project.findFirst({
    where: { id, orgId },
    include: { customer: true, org: { select: { name: true } } },
  })
  if (!project) notFound()

  const drawing = await loadDrawing(project.id).catch(() => ({ shapes: [] }))
  const measurements = computeMeasurements(drawing.shapes)

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

  const poolFields = (project.poolFields ?? {}) as Record<string, unknown>
  const selections: PricingSelections = {
    heaterSelected: asBool(poolFields.heaterSelected),
    saltSystemSelected: asBool(poolFields.saltSystemSelected),
    screenSelected: asBool(poolFields.screenSelected),
    lightingQuantity: asNumber(poolFields.lightingQuantity),
  }

  const quote = computeQuote(items, measurements, selections)

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[8.5in] items-center justify-between px-4 text-sm">
        <Link href={`/projects/${project.id}`} className="text-slate-600 hover:text-slate-900">
          ← Back to project
        </Link>
        <PrintButton />
      </div>
      <div className="mx-auto bg-white shadow-sm">
        <ProposalDocument
          project={project}
          customer={project.customer}
          measurements={measurements}
          quote={quote}
          selections={{
            heaterSelected: selections.heaterSelected ?? false,
            saltSystemSelected: selections.saltSystemSelected ?? false,
            screenSelected: selections.screenSelected ?? false,
            lightingQuantity: selections.lightingQuantity ?? 0,
          }}
          companyName={project.org.name}
          shapes={drawing.shapes}
        />
      </div>
    </div>
  )
}
