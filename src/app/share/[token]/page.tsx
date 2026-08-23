import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { effectiveLightingQuantity } from '@/modules/pricing/engine'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { ProposalDocument } from '@/components/exports/ProposalDocument'
import { AcceptProposalForm } from '@/components/exports/AcceptProposalForm'

// Public, unauthenticated, always fresh.
export const dynamic = 'force-dynamic'

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const project = await db.project.findUnique({
    where: { shareToken: token },
    select: { name: true, org: { select: { name: true } } },
  })
  return { title: project ? `Proposal from ${project.org.name}` : 'Proposal' }
}

export default async function SharedProposalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const project = await db.project.findUnique({
    where: { shareToken: token },
    include: {
      customer: true,
      org: { select: { name: true, taxRatePct: true, logoUrl: true, brandColor: true } },
    },
  })
  if (!project) notFound()

  // The customer's copy is priced by the same loader as the salesperson's.
  const priced = await loadProjectQuote(project.id, project.orgId)
  if (!priced) notFound()
  const { measurements, quote, selections, shapes } = priced

  const accepted = project.proposalAcceptedAt
    ? { name: project.proposalAcceptedName ?? 'Customer', at: fmtDate(project.proposalAcceptedAt) }
    : null

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <div className="mx-auto mb-4 w-full max-w-[8.5in] px-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <AcceptProposalForm token={token} accepted={accepted} />
        </div>
      </div>
      <div className="mx-auto w-full max-w-[8.5in] bg-white p-[0.6in] shadow-sm">
        <ProposalDocument
          project={project}
          customer={project.customer}
          measurements={measurements}
          quote={quote}
          selections={{
            heaterSelected: selections.heaterSelected ?? false,
            saltSystemSelected: selections.saltSystemSelected ?? false,
            screenSelected: selections.screenSelected ?? false,
            lightingQuantity: effectiveLightingQuantity(measurements, selections),
          }}
          companyName={project.org.name}
          logoUrl={project.org.logoUrl}
          brandColor={project.org.brandColor}
          shapes={shapes}
        />
      </div>
    </div>
  )
}
