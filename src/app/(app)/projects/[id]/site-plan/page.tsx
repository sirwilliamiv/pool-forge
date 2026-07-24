import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { loadDrawing } from '@/modules/editor/persistence'
import { computeMeasurements } from '@/modules/measurements/engine'
import { SitePlanDocument } from '@/components/exports/SitePlanDocument'
import { PrintButton } from '@/components/exports/PrintButton'
import './site-plan.css'

export default async function SitePlanPage({
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
    include: { customer: true },
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

  // Survey image overlay is stored as a data URL in the editor state today; once
  // it lives on the server (Phase B follow-up), read it here. For now, render
  // without an underlay if unavailable.
  const surveyImageUrl: string | null = null

  const pf = (project.poolFields ?? {}) as Record<string, unknown>
  const jurisdiction = typeof pf.jurisdiction === 'string' ? pf.jurisdiction : null
  const parcelId = typeof pf.parcelId === 'string' ? pf.parcelId : null

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <div className="no-print fixed right-4 top-4 z-50">
        <PrintButton label="Print / Save as PDF" />
      </div>
      <SitePlanDocument
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
        surveyImageUrl={surveyImageUrl}
        jurisdiction={jurisdiction}
        parcelId={parcelId}
      />
    </div>
  )
}
