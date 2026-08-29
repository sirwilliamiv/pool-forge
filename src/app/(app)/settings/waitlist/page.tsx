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
    <div className="container space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Waitlist</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} signup{rows.length === 1 ? '' : 's'} · {waiting} waiting · {invited} invited
          {rows.length === SIGNUP_PAGE_LIMIT ? ` · showing the first ${SIGNUP_PAGE_LIMIT}` : ''}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            ← Back to projects
          </Link>
        </p>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Sort signups">
        {SORT_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/settings/waitlist?sort=${tab.value}`}
            aria-current={tab.value === sort ? 'true' : undefined}
            className={
              tab.value === sort
                ? 'rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground'
                : 'rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signups</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody has asked yet. The form is at{' '}
              <Link href="/request-access" className="underline underline-offset-4">
                /request-access
              </Link>
              .
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
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
                    <tr key={row.id} className="border-b align-top last:border-0" data-testid="waitlist-row">
                      <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">
                        {fmtDate(row.createdAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-medium">{row.name ?? ''}</div>
                        <div className="text-muted-foreground">{row.company ?? ''}</div>
                      </td>
                      <td className="py-3 pr-4">
                        <a
                          href={`mailto:${row.email}`}
                          className="underline underline-offset-4"
                          data-testid="waitlist-email"
                        >
                          {row.email}
                        </a>
                        <div className="text-muted-foreground">{row.phone ?? ''}</div>
                      </td>
                      <td className="py-3 pr-4">{labelFor(TEAM_SIZE_OPTIONS, row.teamSize)}</td>
                      <td className="py-3 pr-4">{labelFor(USES_TODAY_OPTIONS, row.usesToday)}</td>
                      <td className="max-w-[24rem] py-3 pr-4 text-muted-foreground">
                        {row.note ?? ''}
                        {row.source === null ? null : (
                          <div className="mt-1 text-xs text-muted-foreground">via {row.source}</div>
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
                              className="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
                            >
                              Mark invited
                            </button>
                          ) : (
                            <>
                              <span className="rounded-full bg-pfAccentSoft px-2.5 py-1 text-xs text-pfAccentStrong">
                                Invited {fmtDate(row.invitedAt)}
                              </span>
                              <button
                                type="submit"
                                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
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
