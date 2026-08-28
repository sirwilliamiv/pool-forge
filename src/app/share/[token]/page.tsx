import { ExportKind } from '@prisma/client'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { buildExportDocument } from '@/modules/exports/document/build'
import { readStoredExportParts, storedProposalForShare } from '@/modules/exports/document/read'
import { PAGE_CSS } from '@/modules/exports/document/print-css'
import { AcceptProposalForm } from '@/components/exports/AcceptProposalForm'

// Public, unauthenticated. Dynamic because acceptance state changes what this
// page shows; the document itself is a stored file, not a fresh render.
export const dynamic = 'force-dynamic'

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

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
    select: {
      id: true,
      orgId: true,
      proposalAcceptedAt: true,
      proposalAcceptedName: true,
    },
  })
  if (!project) notFound()

  const accepted = project.proposalAcceptedAt
    ? { name: project.proposalAcceptedName ?? 'Customer', at: fmtDate(project.proposalAcceptedAt) }
    : null

  // The copy that was sent, not a fresh render.
  //
  // This page used to price the project from whichever price book was active at
  // the moment the customer happened to open the link, which meant a proposal
  // somebody had already signed could quietly change its own total. The stored
  // file settles it: before acceptance the customer sees the last copy that was
  // sent, and after acceptance they see the copy that stood when they signed,
  // for as long as the link lives.
  const stored = await storedProposalForShare(project)
  const parts = stored ? await readStoredExportParts(stored) : null

  // Only for a project shared before documents were stored, or one whose stored
  // file cannot be read. A live render is worse than a stored one, but showing
  // the customer nothing at all is worse than both.
  const live =
    parts === null
      ? await buildExportDocument({
          kind: ExportKind.CUSTOMER_PROPOSAL,
          projectId: project.id,
          orgId: project.orgId,
          options: {},
        })
      : null
  if (parts === null && !live) notFound()

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      {/* The stored file's own stylesheet, or the page rules for a live render.
          The stored CSS is stock Tailwind compiled from the stored markup, so
          it defines exactly the utilities that markup uses and nothing else. */}
      <style dangerouslySetInnerHTML={{ __html: parts?.css ?? PAGE_CSS[ExportKind.CUSTOMER_PROPOSAL] }} />
      <div className="mx-auto mb-4 w-full max-w-[8.5in] px-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <AcceptProposalForm token={token} accepted={accepted} />
        </div>
      </div>
      {stored && parts ? (
        <div className="no-print mx-auto mb-4 w-full max-w-[8.5in] px-4 text-xs text-slate-500">
          Issued {fmtDateTime(stored.generatedAt)}.{' '}
          {accepted ? 'This is the copy you accepted.' : 'This is the copy that was sent to you.'}{' '}
          <a href={`/share/${token}/document`} className="underline">
            Download it
          </a>
          .
        </div>
      ) : null}
      <div className="mx-auto w-full max-w-[8.5in] bg-white p-[0.6in] shadow-sm">
        {parts ? (
          <div className={parts.rootClassName} dangerouslySetInnerHTML={{ __html: parts.markup }} />
        ) : (
          live?.element
        )}
      </div>
    </div>
  )
}
