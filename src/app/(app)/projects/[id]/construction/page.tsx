import { ExportKind } from '@prisma/client'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { buildExportDocument } from '@/modules/exports/document/build'
import { ensureJobNumber } from '@/modules/projects/job-number'
import type { ConstructionPageSize } from '@/components/exports/ConstructionDocument'
import { PrintButton } from '@/components/exports/PrintButton'

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

  // Same number as the proposal. A packet and a proposal for one job that
  // reference it two different ways is how a crew ends up digging the wrong hole.
  await ensureJobNumber(id, orgId)

  // The same assembly the stored copy is serialised from.
  const built = await buildExportDocument({
    kind: ExportKind.CONSTRUCTION_PACKET,
    projectId: id,
    orgId,
    options: { pageSize },
  })
  if (!built) notFound()

  const otherSize: ConstructionPageSize = pageSize === 'tabloid' ? 'letter' : 'tabloid'

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <style dangerouslySetInnerHTML={{ __html: built.pageCss }} />
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
      {built.element}
    </div>
  )
}
