import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { ScreenEnclosureQuoteDocument } from '@/components/exports/ScreenEnclosureQuoteDocument'
import { PrintButton } from '@/components/exports/PrintButton'
import './screen-enclosure-quote.css'

function flag(v: string | string[] | undefined): boolean {
  const raw = Array.isArray(v) ? v[0] : v
  return raw === '1' || raw === 'true'
}

export default async function ScreenEnclosureQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ pricing?: string | string[]; subtotal?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const sp = (await searchParams) ?? {}
  // Defaults: hide all pricing (it's an RFQ to a subcontractor).
  const showInternalPricing = flag(sp.pricing)
  const showScreenScopeRetail = flag(sp.subtotal)

  const project = await db.project.findFirst({
    where: { id, orgId },
    include: { customer: true, org: { select: { name: true, taxRatePct: true } } },
  })
  if (!project) notFound()

  const priced = await loadProjectQuote(project.id, orgId)
  if (!priced) notFound()
  const { shapes, measurements, quote } = priced

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <div className="no-print fixed right-4 top-4 z-50 flex items-center gap-2">
        <a
          href={`?${showInternalPricing ? '' : 'pricing=1'}`}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          {showInternalPricing ? 'Hide pricing' : 'Show internal pricing'}
        </a>
        <a
          href={`?${showScreenScopeRetail ? '' : 'subtotal=1'}`}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          {showScreenScopeRetail ? 'Hide retail subtotal' : 'Show retail subtotal'}
        </a>
        <PrintButton label="Print / Save as PDF" />
      </div>
      <ScreenEnclosureQuoteDocument
        project={{
          id: project.id,
          name: project.name,
          salesperson: project.salesperson,
          internalNotes: project.internalNotes,
          poolFields: project.poolFields,
          createdAt: project.createdAt,
        }}
        customer={
          project.customer
            ? {
                name: project.customer.name,
                email: project.customer.email,
                phone: project.customer.phone,
                address: project.customer.address,
              }
            : null
        }
        shapes={shapes}
        measurements={measurements}
        quote={quote}
        companyName={project.org.name}
        showInternalPricing={showInternalPricing}
        showScreenScopeRetail={showScreenScopeRetail}
      />
    </div>
  )
}
