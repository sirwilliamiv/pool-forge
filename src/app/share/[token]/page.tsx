import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { effectiveLightingQuantity } from '@/modules/pricing/engine'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import {
  COMPANY_PROFILE_SELECT,
  DEFAULT_PROPOSAL_TERMS,
  parsePaymentSchedule,
} from '@/modules/organization/company'
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
      // The same company details, the same schedule and the same terms the
      // builder's own copy prints. The customer's copy is the one that gets
      // signed, so it cannot be the thinner document of the two.
      org: {
        select: {
          ...COMPANY_PROFILE_SELECT,
          taxRatePct: true,
          paymentSchedule: true,
          proposalTerms: true,
          proposalValidDays: true,
        },
      },
    },
  })
  if (!project) notFound()

  // The customer's copy is priced by the same loader as the salesperson's.
  const priced = await loadProjectQuote(project.id, project.orgId)
  if (!priced) notFound()
  const { measurements, quote, selections, shapes, poolFields } = priced

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
          // The loader's pool fields, so the customer's copy prints the finish
          // the pool is drawn with — the same row the salesperson's copy shows.
          project={{ ...project, poolFields }}
          customer={project.customer}
          measurements={measurements}
          quote={quote}
          selections={{
            heaterSelected: selections.heaterSelected ?? false,
            saltSystemSelected: selections.saltSystemSelected ?? false,
            screenSelected: selections.screenSelected ?? false,
            lightingQuantity: effectiveLightingQuantity(measurements, selections),
          }}
          company={{
            name: project.org.name,
            logoUrl: project.org.logoUrl,
            brandColor: project.org.brandColor,
            address: project.org.address,
            phone: project.org.phone,
            email: project.org.email,
            licenseNumber: project.org.licenseNumber,
          }}
          // Never assigned here: this page is public, and a write reachable
          // without a session is a write anyone holding the link can trigger.
          // The number is stamped when the project is created and when the
          // builder opens the proposal or creates the share link.
          jobNumber={project.jobNumber}
          paymentSchedule={parsePaymentSchedule(project.org.paymentSchedule)}
          proposalValidDays={project.org.proposalValidDays}
          terms={project.org.proposalTerms?.trim() || DEFAULT_PROPOSAL_TERMS}
          shapes={shapes}
        />
      </div>
    </div>
  )
}
