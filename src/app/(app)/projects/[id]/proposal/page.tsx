import { ExportKind } from '@prisma/client'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { buildExportDocument } from '@/modules/exports/document/build'
import { latestStoredExport } from '@/modules/exports/document/read'
import { ensureJobNumber } from '@/modules/projects/job-number'
import { PrintButton } from '@/components/exports/PrintButton'
import { SentCopyNotice } from '@/components/exports/SentCopyNotice'

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
  return { title: project ? `Proposal · ${project.name}` : 'Proposal' }
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

  // Projects created before job numbers existed have none, and a proposal with
  // a blank where the reference number goes is the problem the number exists to
  // remove. Idempotent and org-scoped: it writes once, ever, per project.
  // Before the document is built, so the document carries the number.
  await ensureJobNumber(id, orgId)

  // One assembly, two consumers: this page renders the element, and
  // `renderExportDocument` serialises the identical element to the bytes that
  // get stored. They cannot print different numbers because they are the same
  // component tree with the same props.
  const built = await buildExportDocument({
    kind: ExportKind.CUSTOMER_PROPOSAL,
    projectId: id,
    orgId,
    options: {},
  })
  if (!built) notFound()

  // What the customer's link is actually showing right now. Without this the
  // builder is looking at a live render and has no way to know it differs from
  // the copy that was sent.
  const sent = await latestStoredExport({
    projectId: id,
    orgId,
    kind: ExportKind.CUSTOMER_PROPOSAL,
  })

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      {/* Paper size, margins and page breaks. One definition, shared with the
          stored copy, so the two print the same way. */}
      <style dangerouslySetInnerHTML={{ __html: built.pageCss }} />
      <div className="no-print mx-auto mb-4 flex max-w-[8.5in] items-center justify-between px-4 text-sm">
        <Link href={`/projects/${id}`} className="text-slate-600 hover:text-slate-900">
          ← Back to project
        </Link>
        <PrintButton />
      </div>
      {sent ? (
        <div className="no-print mx-auto mb-4 max-w-[8.5in] px-4">
          <SentCopyNotice
            generatedAt={sent.generatedAt}
            byteSize={sent.byteSize}
            contentHash={sent.contentHash}
            href={`/api/exports/${sent.id}`}
          />
        </div>
      ) : null}
      <div className="mx-auto bg-white shadow-sm">{built.element}</div>
    </div>
  )
}
