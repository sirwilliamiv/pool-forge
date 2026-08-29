// Writing down that somebody wants their design sent to them.
//
// WHY THIS IS AN INSERT AND THE WAITLIST IS AN UPSERT
//
// `WaitlistSignup` is keyed on the address because there is one fact per person
// there: they want in. Here there is one fact per *design*: this person liked
// this backyard on this day, and a couple who saves a compact pool on Tuesday
// and an estate pool on Sunday has told a builder two different and equally
// real things. Collapsing those onto the address would throw away the more
// interesting of the two.
//
// The row therefore has no unique key a stranger controls, which removes the
// membership oracle by construction rather than by careful handling: there is
// no conflict path to behave differently on. The rate limit is what stops the
// table filling up, and it is the only thing that needs to.
//
// The ballpark is stored as the two numbers the visitor was actually shown,
// not recomputed later. Reference rates will change, and a lead is a record of
// a conversation somebody has already had with this page. A builder ringing in
// three weeks needs to know what number is in that person's head, which is the
// old one.

import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

import type { DreamLeadInput } from './schema'

function newId(): string {
  return `drm_${randomUUID().replace(/-/g, '')}`
}

/** `undefined` is not a value Postgres takes; an unanswered field is NULL. */
function orNull(value: string | undefined): string | null {
  return value ?? null
}

/**
 * Record the lead. Returns nothing, deliberately: there is no fact about who
 * else has used this page that a caller from the public internet is entitled
 * to.
 */
export async function recordDreamLead(
  input: DreamLeadInput,
  now: Date = new Date(),
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "DreamDesign"
      ("id", "email", "name", "postcode", "timeframe", "design",
       "ballparkLow", "ballparkHigh", "source", "createdAt")
    VALUES (
      ${newId()},
      ${input.email},
      ${orNull(input.name)},
      ${orNull(input.postcode)},
      ${orNull(input.timeframe)},
      ${input.design},
      ${input.ballparkLow},
      ${input.ballparkHigh},
      ${orNull(input.source)},
      ${now}
    )
  `)
}
