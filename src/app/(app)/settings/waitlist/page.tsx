// Who has asked to be let in, and who has been.
//
// The screen exists to answer one question: who is worth inviting next. That is
// why team size and what they estimate with today are columns rather than
// details behind a click, and why the default order is the order they arrived
// in.
//
// Not linked from the top navigation on purpose. Every account in this beta
// belongs to a builder, and the builders must not find a list of the other
// builders talking to us. Access is `WAITLIST_OPERATOR_EMAILS`; anyone else
// gets a 404, which tells them nothing about whether the page exists.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import {
  listWaitlistSignups,
  parseSignupSort,
  SIGNUP_PAGE_LIMIT,
  type SignupSort,
} from '@/modules/waitlist/admin'
import { isWaitlistOperator } from '@/modules/waitlist/operators'
import { labelFor, TEAM_SIZE_OPTIONS, USES_TODAY_OPTIONS } from '@/modules/waitlist/schema'

import { markInvitedAction } from './actions'

export const dynamic = 'force-dynamic'

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

const SORT_TABS: ReadonlyArray<{ value: SignupSort; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'team', label: 'Biggest team first' },
]

export default async function WaitlistSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (!isWaitlistOperator(session.user.email)) notFound()

  const { sort: sortParam } = await searchParams
  const sort = parseSignupSort(sortParam)
  const rows = await listWaitlistSignups(sort)

  const invited = rows.filter((row) => row.invitedAt !== null).length
  const waiting = rows.length - invited

  return (
    <div className="container space-y-8 bg-theme-bg py-10 text-theme-fg">
      <SettingsHeader
        title="Waitlist"
        description={
          <span className="font-brandMono text-formLabel uppercase text-theme-faint">
            {rows.length} signup{rows.length === 1 ? '' : 's'} · {waiting} waiting · {invited}{' '}
            invited
            {rows.length === SIGNUP_PAGE_LIMIT ? ` · showing the first ${SIGNUP_PAGE_LIMIT}` : ''}
          </span>
        }
      />

      <nav className="flex flex-wrap gap-2" aria-label="Sort signups">
        {SORT_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/settings/waitlist?sort=${tab.value}`}
            aria-current={tab.value === sort ? 'true' : undefined}
            className={
              tab.value === sort
                ? 'rounded-brand bg-theme-fg px-3 py-1.5 text-bodyS text-theme-bg'
                : 'rounded-brand px-3 py-1.5 text-bodyS text-theme-muted shadow-[inset_0_0_0_1px_var(--theme-border)] hover:text-theme-fg'
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle>Signups</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-bodyS text-theme-muted">
              Nobody has asked yet. The form is at{' '}
              <Link href="/request-access" className="underline underline-offset-4">
                /request-access
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-bodyS">
                <thead>
                  <tr className="border-b border-theme-line text-left font-brandMono text-formLabel uppercase text-theme-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Arrived
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Who
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Contact
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Would use it
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Uses today
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Note
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-theme-line align-top last:border-0"
                      data-testid="waitlist-row"
                    >
                      <td className="whitespace-nowrap py-3 pr-4 font-brandMono text-formLabel text-theme-muted">
                        {fmtDate(row.createdAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-theme-fg">{row.name ?? ''}</div>
                        <div className="text-theme-muted">{row.company ?? ''}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <a
                          href={`mailto:${row.email}`}
                          className="underline underline-offset-4"
                          data-testid="waitlist-email"
                        >
                          {row.email}
                        </a>
                        <div className="font-brandMono text-formLabel text-theme-muted">
                          {row.phone ?? ''}
                        </div>
                      </td>
                      <td className="py-3 pr-4">{labelFor(TEAM_SIZE_OPTIONS, row.teamSize)}</td>
                      <td className="py-3 pr-4">{labelFor(USES_TODAY_OPTIONS, row.usesToday)}</td>
                      <td className="max-w-[24rem] py-3 pr-4 text-theme-muted">
                        {row.note ?? ''}
                        {row.source === null ? null : (
                          <div className="mt-1 font-brandMono text-formLabel text-theme-faint">
                            via {row.source}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3">
                        <form action={markInvitedAction} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={row.id} />
                          <input
                            type="hidden"
                            name="invited"
                            value={row.invitedAt === null ? 'true' : 'false'}
                          />
                          {row.invitedAt === null ? (
                            <button
                              type="submit"
                              className="rounded-brand px-2.5 py-1 font-brandMono text-formLabel uppercase text-theme-fg shadow-[inset_0_0_0_1px_var(--theme-border)] transition-[background] duration-brand ease-brand hover:bg-theme-card"
                            >
                              Mark invited
                            </button>
                          ) : (
                            <>
                              <span className="rounded-full bg-tint-honeydew px-2.5 py-1 font-brandMono text-formLabel uppercase text-brand-green">
                                Invited {fmtDate(row.invitedAt)}
                              </span>
                              <button
                                type="submit"
                                className="font-brandMono text-formLabel uppercase text-theme-muted underline underline-offset-4 hover:text-theme-fg"
                              >
                                Undo
                              </button>
                            </>
                          )}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
