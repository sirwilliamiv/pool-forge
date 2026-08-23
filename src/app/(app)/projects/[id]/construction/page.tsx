import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { ensureJobNumber } from '@/modules/projects/job-number'
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
    include: { customer: true, org: { select: { taxRatePct: true } } },
  })
  if (!project || project.orgId !== orgId) notFound()

  // Same loader as the proposal, so the builder's sheet and the customer's
  // sheet cannot print two different totals for one job.
  const priced = await loadProjectQuote(project.id, orgId)
  if (!priced) notFound()
  const { shapes, measurements, quote, poolFields } = priced

  // Same number as the proposal. A packet and a proposal for one job that
  // reference it two different ways is how a crew ends up digging the wrong hole.
  const jobNumber = await ensureJobNumber(project.id, orgId)

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
          jobNumber,
          name: project.name,
          salesperson: project.salesperson,
          designer: project.designer,
          internalNotes: project.internalNotes,
          // The loader's, not the raw column: the packet prints the finish the
          // pool is drawn with rather than a blank Interior finish row.
          poolFields,
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
