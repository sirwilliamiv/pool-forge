import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, type PriceBookItemLite, type PricingSelections } from '@/modules/pricing/engine'
import { ScreenEnclosureQuoteDocument } from '@/components/exports/ScreenEnclosureQuoteDocument'
import { PrintButton } from '@/components/exports/PrintButton'
import './screen-enclosure-quote.css'

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
    include: { customer: true, org: { select: { name: true } } },
  })
  if (!project) notFound()

  let shapes: Awaited<ReturnType<typeof loadDrawing>>['shapes'] = []
  try {
    const drawing = await loadDrawing(project.id)
    shapes = drawing.shapes
  } catch (err) {
    console.error('loadDrawing failed', err)
  }

  const measurements = computeMeasurements(shapes)

  const priceBook = await db.priceBook.findFirst({
    where: { orgId, isActive: true },
    orderBy: { version: 'desc' },
    include: { items: true },
  })
  const items: PriceBookItemLite[] =
    priceBook?.items.map((i) => ({
      id: i.id,
      category: i.category,
      name: i.name,
      unitType: i.unitType,
      retailPrice: Number(i.retailPrice),
    })) ?? []

  const pf = (project.poolFields ?? {}) as Record<string, unknown>
  const selections: PricingSelections = {
    heaterSelected: asBool(pf.heaterSelected),
    saltSystemSelected: asBool(pf.saltSystemSelected),
    screenSelected: asBool(pf.screenSelected),
    lightingQuantity: asNumber(pf.lightingQuantity),
  }
  const quote = computeQuote(items, measurements, selections)

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
