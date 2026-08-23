import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { effectiveLightingQuantity } from '@/modules/pricing/engine'
import { loadProjectQuote } from '@/modules/projects/snapshot'
import { ensureJobNumber } from '@/modules/projects/job-number'
import {
  COMPANY_PROFILE_SELECT,
  DEFAULT_PROPOSAL_TERMS,
  parsePaymentSchedule,
} from '@/modules/organization/company'
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

  // Projects created before job numbers existed have none, and a proposal with
  // a blank where the reference number goes is the problem the number exists to
  // remove. Idempotent and org-scoped: it writes once, ever, per project.
  const jobNumber = await ensureJobNumber(project.id, orgId)

  // One loader, one quote: the editor dock, this proposal, the construction
  // packet and the shared customer link all read the same figures from here.
  const priced = await loadProjectQuote(project.id, orgId)
  if (!priced) notFound()
  const { measurements, quote, selections, shapes, poolFields } = priced

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
          // `poolFields` from the loader, not the raw column: it carries the
          // interior finish and coping the pool is actually drawn with. Both
          // rows printed blank because nothing wrote the picked finish anywhere
          // this document could read it.
          project={{ ...project, poolFields }}
          customer={project.customer}
          measurements={measurements}
          quote={quote}
          selections={{
            heaterSelected: selections.heaterSelected ?? false,
            saltSystemSelected: selections.saltSystemSelected ?? false,
            screenSelected: selections.screenSelected ?? false,
            // The lights the quote actually bills, which is the drawing's count
            // when there is one. The proposal used to read only the form field,
            // so a design with a light in it said "Pool lighting: Not specified".
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
          jobNumber={jobNumber}
          paymentSchedule={parsePaymentSchedule(project.org.paymentSchedule)}
          proposalValidDays={project.org.proposalValidDays}
          terms={project.org.proposalTerms?.trim() || DEFAULT_PROPOSAL_TERMS}
          shapes={shapes}
        />
      </div>
    </div>
  )
}
