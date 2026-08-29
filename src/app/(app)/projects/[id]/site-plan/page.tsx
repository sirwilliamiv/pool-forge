import { ExportKind } from '@prisma/client'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { buildExportDocument } from '@/modules/exports/document/build'
import { PrintButton } from '@/components/exports/PrintButton'

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

  const built = await buildExportDocument({
    kind: ExportKind.SITE_PLAN,
    projectId: id,
    orgId,
    options: {},
  })
  if (!built) notFound()

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <style dangerouslySetInnerHTML={{ __html: built.pageCss }} />
      <div className="no-print fixed right-4 top-4 z-50">
        <PrintButton label="Print / Save as PDF" />
      </div>
      {built.element}
    </div>
  )
}
