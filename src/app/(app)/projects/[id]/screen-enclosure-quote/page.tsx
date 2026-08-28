import { ExportKind } from '@prisma/client'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { buildExportDocument } from '@/modules/exports/document/build'
import { PrintButton } from '@/components/exports/PrintButton'

function flag(v: string | string[] | undefined): boolean {
  const raw = Array.isArray(v) ? v[0] : v
  return raw === '1' || raw === 'true'
}

export default async function ScreenEnclosureQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ pricing?: string | string[]; subtotal?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const { id } = await params
  const sp = (await searchParams) ?? {}
  // Defaults: hide all pricing (it's an RFQ to a subcontractor).
  const showInternalPricing = flag(sp.pricing)
  const showScreenScopeRetail = flag(sp.subtotal)

  const built = await buildExportDocument({
    kind: ExportKind.SCREEN_ENCLOSURE_QUOTE,
    projectId: id,
    orgId,
    options: { showInternalPricing, showScreenScopeRetail },
  })
  if (!built) notFound()

  return (
    <div className="min-h-screen bg-neutral-100 py-6">
      <style dangerouslySetInnerHTML={{ __html: built.pageCss }} />
      <div className="no-print fixed right-4 top-4 z-50 flex items-center gap-2">
        <a
          href={`?${showInternalPricing ? '' : 'pricing=1'}`}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          {showInternalPricing ? 'Hide pricing' : 'Show internal pricing'}
        </a>
        <a
          href={`?${showScreenScopeRetail ? '' : 'subtotal=1'}`}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
        >
          {showScreenScopeRetail ? 'Hide retail subtotal' : 'Show retail subtotal'}
        </a>
        <PrintButton label="Print / Save as PDF" />
      </div>
      {built.element}
    </div>
  )
}
