// Reading the list, and marking somebody as invited.
//
// ORG SCOPING
//
// `CLAUDE.md` requires every Prisma query in app code to filter by `orgId`, and
// these two do not, because `WaitlistSignup` has no `orgId` and could not have
// one: a person on this list has no organisation yet, which is the entire
// reason they are on it. The rows belong to Pool Forge rather than to any
// builder using it, so the access rule cannot be org membership either. It is
// `isWaitlistOperator`, and it is checked in the page AND again in the action,
// because a server action is an endpoint and the page's check does not travel
// with it.

import { db } from '@/lib/db'

import { rankOf, TEAM_SIZE_OPTIONS } from './schema'

/**
 * Ceiling on one screenful. This is a hand-read sales pipeline for an
 * invite-only beta; if it ever passes 500 rows, the answer is paging and
 * filtering, not a taller page.
 */
export const SIGNUP_PAGE_LIMIT = 500

export const SIGNUP_SORTS = ['newest', 'oldest', 'team'] as const
export type SignupSort = (typeof SIGNUP_SORTS)[number]

export function parseSignupSort(value: string | undefined): SignupSort {
  return SIGNUP_SORTS.includes((value ?? '') as SignupSort) ? (value as SignupSort) : 'newest'
}

export interface SignupRow {
  id: string
  email: string
  name: string | null
  company: string | null
  phone: string | null
  teamSize: string | null
  usesToday: string | null
  note: string | null
  source: string | null
  invitedAt: Date | null
  createdAt: Date
}

/**
 * Every signup, ordered for the decision being made.
 *
 * Sorting happens here rather than in SQL because "biggest team first" is an
 * order over a closed list of labels, not over the text stored in the column,
 * and 500 rows is nothing to sort in memory. The database still does the work
 * that matters: `@@index([createdAt])` covers the default order.
 */
export async function listWaitlistSignups(sort: SignupSort = 'newest'): Promise<SignupRow[]> {
  const rows = await db.waitlistSignup.findMany({
    orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
    take: SIGNUP_PAGE_LIMIT,
  })
  if (sort !== 'team') return rows

  // Largest team first, unanswered last, newest first inside a tie. An
  // unanswered team size is not "small", it is unknown, so it does not get to
  // sit at either end of the list pretending to be information.
  const unknown = TEAM_SIZE_OPTIONS.length
  return [...rows].sort((a, b) => {
    const ra = rankOf(TEAM_SIZE_OPTIONS, a.teamSize)
    const rb = rankOf(TEAM_SIZE_OPTIONS, b.teamSize)
    if (ra !== rb) {
      if (ra === unknown) return 1
      if (rb === unknown) return -1
      return rb - ra
    }
    return b.createdAt.getTime() - a.createdAt.getTime()
  })
}

/**
 * Mark somebody as invited, or take the mark back.
 *
 * Un-marking exists because the mark is a note about what a person did, and
 * people mis-click. It does not revoke anything: the invite itself is a
 * separate object with its own lifecycle, and this column only records that
 * one was sent.
 */
export async function setWaitlistInvited(
  id: string,
  invited: boolean,
  now: Date = new Date(),
): Promise<void> {
  await db.waitlistSignup.update({
    where: { id },
    data: { invitedAt: invited ? now : null },
  })
}
