import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, toPriceBookItems } from '@/modules/pricing/engine'
import { pricingSelectionsFrom } from '@/modules/projects/pool-fields'
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
    include: {
      customer: true,
      org: { select: { name: true, taxRatePct: true, logoUrl: true, brandColor: true } },
    },
  })
  if (!project) notFound()

  const drawing = await loadDrawing(project.id).catch(() => ({ shapes: [] }))
  const measurements = computeMeasurements(drawing.shapes)

  const priceBook = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    include: { items: true },
  })

  const items = toPriceBookItems(priceBook?.items ?? [])
  const selections = pricingSelectionsFrom(project.poolFields)

  const quote = computeQuote(items, measurements, selections, {
    taxRatePct: project.org.taxRatePct,
  })

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
          logoUrl={project.org.logoUrl}
          brandColor={project.org.brandColor}
          shapes={drawing.shapes}
        />
      </div>
    </div>
  )
}
