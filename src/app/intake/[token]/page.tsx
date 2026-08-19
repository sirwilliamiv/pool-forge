// Public customer intake page. No auth: the unguessable token is the
// capability, same as /share/[token].
//
// The builder's company name is rendered prominently and the copy names them
// explicitly. A page that asks a stranger for their phone number and photos of
// their house without saying who is receiving them reads as phishing, and the
// homeowner is right to close it.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/lib/db'
import { resolveIntakeLink } from '@/modules/imports/intake/links'
import { IntakeUploadForm } from './IntakeUploadForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params
  const link = await resolveIntakeLink(token)
  return {
    title: link ? `Send photos to ${link.orgName}` : 'Upload link',
    // A public capability URL must never be handed to a crawler.
    robots: { index: false, follow: false },
  }
}

export default async function IntakePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Unknown, malformed, deactivated, and expired links are indistinguishable
  // from here: `resolveIntakeLink` returns one null with no discriminant, and
  // the page renders the same 404 for all four.
  const link = await resolveIntakeLink(token)
  if (link === null) notFound()

  const org = await db.organization.findUnique({
    where: { id: link.orgId },
    select: { name: true, logoUrl: true, brandColor: true },
  })
  if (!org) notFound()

  const accent = org.brandColor ?? '#0284c7'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white" style={{ borderTopColor: accent, borderTopWidth: 4 }}>
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-4">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logoUrl}
              alt=""
              className="h-10 w-10 rounded object-contain"
              width={40}
              height={40}
            />
          ) : (
            <div
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded text-sm font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {org.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{org.name}</p>
            <p className="text-xs text-slate-500">Pool design intake</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Send {org.name} your inspiration pictures
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Drop in any pictures of pools you like, a sketch of your yard, or a copy of your survey.
            {' '}
            {org.name} uses them to start your design. Nothing is shared publicly.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm sm:p-6">
          <IntakeUploadForm token={token} orgName={org.name} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          You are uploading to {org.name}. If you were not expecting this link, close this page.
        </p>
        <p className="mt-2 text-center text-xs text-slate-400">
          <Link href="/" className="hover:underline">
            Pool Forge
          </Link>
        </p>
      </main>
    </div>
  )
}
