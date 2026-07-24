import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { computeQuote, type PriceBookItemLite } from '@/modules/pricing/engine'
import {
  ConstructionDocument,
  type ConstructionPageSize,
} from '@/components/exports/ConstructionDocument'
import { PrintButton } from '@/components/exports/PrintButton'
import './construction.css'

function parsePageSize(v: string | string[] | undefined): ConstructionPageSize {
  const raw = Array.isArray(v) ? v[0] : v
  return raw === 'letter' ? 'letter' : 'tabloid'
}

interface PoolFieldsLite {
  heaterSelected?: boolean
  saltSystemSelected?: boolean
  screenSelected?: boolean
  lightingQuantity?: number | string
}

export default async function ConstructionPacketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ size?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const pageSize = parsePageSize((await searchParams)?.size)
  const project = await db.project.findUnique({
    where: { id },
    include: { customer: true },
  })
  if (!project || project.orgId !== orgId) notFound()

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
      required: i.required,
    })) ?? []

  const pf = (project.poolFields ?? {}) as PoolFieldsLite
  const lightingQty =
    typeof pf.lightingQuantity === 'number'
      ? pf.lightingQuantity
      : Number(pf.lightingQuantity ?? 0) || 0

  const quote = computeQuote(items, measurements, {
    heaterSelected: Boolean(pf.heaterSelected),
    saltSystemSelected: Boolean(pf.saltSystemSelected),
    screenSelected: Boolean(pf.screenSelected),
    lightingQuantity: lightingQty,
  })

  const otherSize: ConstructionPageSize = pageSize === 'tabloid' ? 'letter' : 'tabloid'

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <div className="no-print fixed right-4 top-4 z-50 flex items-center gap-2">
        <a
          href={`?size=${otherSize}`}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          Switch to {otherSize === 'tabloid' ? '11×17' : 'Letter'}
        </a>
        <PrintButton
          label={`Print / Save as PDF (${pageSize === 'tabloid' ? '11×17' : 'Letter'})`}
        />
      </div>
      <ConstructionDocument
        project={{
          id: project.id,
          name: project.name,
          salesperson: project.salesperson,
          designer: project.designer,
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
        pageSize={pageSize}
      />
    </div>
  )
}
