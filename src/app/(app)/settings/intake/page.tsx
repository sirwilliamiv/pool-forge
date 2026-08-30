// Builder-side settings for the customer intake funnel: the links, and the
// leads that have come through them.
//
// Reads are org-scoped server queries, matching the other settings pages.
// Writes all go through the command registry via `IntakeLinksPanel`.

import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IntakeLinksPanel, type IntakeLinkView } from '@/components/settings/IntakeLinksPanel'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { listIntakeLinks, listIntakeSubmissions } from '@/modules/imports/intake/links'

export const dynamic = 'force-dynamic'

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

/** Public origin for the copyable link, from the request the builder is on. */
async function publicOrigin(): Promise<string> {
  const configured = (process.env.AUTH_URL ?? '').trim()
  if (configured !== '') return configured.replace(/\/+$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host === null ? '' : `${proto}://${host}`
}

export default async function IntakeSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const [links, submissions, origin] = await Promise.all([
    listIntakeLinks(orgId),
    listIntakeSubmissions(orgId),
    publicOrigin(),
  ])

  const views: IntakeLinkView[] = links.map((link) => ({
    id: link.id,
    label: link.label,
    url: `${origin}/intake/${link.token}`,
    active: link.active,
    expiresAt: link.expiresAt === null ? null : fmtDate(link.expiresAt),
    createdAt: fmtDate(link.createdAt),
    submissionCount: link.submissionCount,
  }))

  const totalSubmissions = links.reduce((sum, link) => sum + link.submissionCount, 0)

  return (
    <div className="container max-w-4xl space-y-8 bg-theme-bg py-10 text-theme-fg">
      <SettingsHeader
        title="Customer uploads"
        description={
          <>
            Send a customer a link and they can drop in inspiration pictures, a sketch, or their
            survey. Each submission arrives as a draft project with the images attached.{' '}
            <span className="font-brandMono text-formLabel uppercase text-theme-faint">
              {totalSubmissions} submission{totalSubmissions === 1 ? '' : 's'} so far
            </span>
          </>
        }
      />

      <IntakeLinksPanel links={views} />

      <Card>
        <CardHeader>
          <CardTitle>Recent submissions</CardTitle>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="text-bodyS text-theme-muted">
              Nothing yet. Submissions show up here and on your dashboard as draft projects.
            </p>
          ) : (
            <ul className="divide-y divide-theme-line">
              {submissions.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-bodyS font-medium text-theme-fg">
                      {s.customerName ?? s.email ?? s.phone ?? 'Anonymous'}
                    </div>
                    <div className="font-brandMono text-formLabel text-theme-muted">
                      via {s.linkLabel} · {fmtDate(s.createdAt)} · {s.imageCount} image
                      {s.imageCount === 1 ? '' : 's'}
                    </div>
                  </div>
                  {s.projectId === null ? (
                    <span className="font-brandMono text-formLabel uppercase text-theme-faint">
                      No project
                    </span>
                  ) : (
                    <Link
                      href={`/projects/${s.projectId}`}
                      className="text-bodyS font-medium text-theme-fg underline-offset-4 hover:underline"
                    >
                      {s.projectName ?? 'Open draft'}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
