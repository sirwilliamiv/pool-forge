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
import { MonsteraLeaf, PalmFrond } from '@/components/marketing/botanicals'
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
    <div className="relative isolate min-h-screen overflow-hidden bg-theme-card">
      {/* Colour, at a homeowner rather than at a builder.
       *
          This page asks a stranger to photograph their own back yard, so a flat
          grey form is the wrong register: it reads as paperwork. The botanical
          accents are the bible's answer, and this is squarely the surface they
          were written for — it is about the finished yard rather than about the
          tool.
       *
          Behind everything, cropped hard at the corners, and clear of the card
          so nothing sits under the upload control. They shrink rather than
          disappear on a phone, which is where this page is almost always
          opened. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <MonsteraLeaf
          id="intake-a"
          className="absolute -right-16 -top-12 h-64 w-56 sm:-right-20 sm:h-96 sm:w-80"
          style={{ color: 'var(--brand-green)', opacity: 0.9, transform: 'rotate(18deg)' }}
        />
        <PalmFrond
          className="absolute -bottom-16 -left-20 h-64 w-64 sm:-bottom-24 sm:-left-24 sm:h-96 sm:w-96"
          style={{ color: 'var(--tint-sage)', transform: 'rotate(-24deg)' }}
        />
        <span
          className="absolute -left-10 top-1/3 hidden h-40 w-40 rounded-[100%_0_100%_0] lg:block"
          style={{ background: 'var(--tint-honeydew)' }}
        />
      </div>

      {/* The 4px top border is the one place the builder's own brand colour
          shows, not ours: a customer needs to recognise who is asking for
          their photos, and that colour is real per-org data rather than a
          Pool Forge accent. */}
      <header
        className="relative border-b border-theme-line bg-theme-bg"
        style={{ borderTopColor: accent, borderTopWidth: 4 }}
      >
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-4">
          {org.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.logoUrl}
              alt=""
              className="h-10 w-10 rounded-brand object-contain"
              width={40}
              height={40}
            />
          ) : (
            <div
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-brand text-bodyS font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              {org.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-bodyL font-semibold text-theme-fg">{org.name}</p>
            <p className="text-bodyS text-theme-muted">Pool design intake</p>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-title3 font-medium text-theme-fg">
            Send {org.name} your inspiration pictures
          </h1>
          <p className="mt-2 text-bodyS text-theme-muted">
            Drop in any pictures of pools you like, a sketch of your yard, or a copy of your survey.
            {' '}
            {org.name} uses them to start your design. Nothing is shared publicly.
          </p>
        </div>

        <div className="rounded-brand16 border border-theme-line bg-theme-bg p-4 shadow-elevation1 sm:p-6">
          <IntakeUploadForm token={token} orgName={org.name} />
        </div>

        <p className="mt-6 text-center text-bodyS text-theme-muted">
          You are uploading to {org.name}. If you were not expecting this link, close this page.
        </p>
        <p className="mt-2 text-center text-bodyS text-theme-faint">
          <Link href="/" className="hover:text-theme-fg hover:underline">
            Pool Forge
          </Link>
        </p>
      </main>
    </div>
  )
}
