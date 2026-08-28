// Recording somebody who asked to be let in.
//
// WHY THIS TELLS THE CALLER NOTHING
//
// The one thing this function must never do is behave differently for an
// address that is already on the list. "You are already signed up" is a
// membership oracle: anyone could type a competitor's sales address, or a
// prospect's, and learn whether that company has been talking to us. So there
// is one return value, one code path, and one sentence on screen, whether the
// row was created just now or three weeks ago.
//
// That is also why this is an upsert rather than a create-and-catch. A unique
// violation surfacing as an error would be a difference the caller could see,
// and the first version of any such handler ends up logging or timing
// differently on the conflict path.
//
// WHY COALESCE, AND NOT AN OVERWRITE
//
// The endpoint is public, so the email address is not proof of anything. If a
// second submission overwrote the first, anyone who knew a builder's address
// could scribble over that builder's record, or empty it. `COALESCE` makes a
// repeat submission strictly additive: it can fill in a field that is still
// blank, and it can never change or clear one that is already answered.
// `invitedAt` is never touched here at all, so a re-submission cannot un-invite
// anybody.

import { randomUUID } from 'node:crypto'

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

import type { WaitlistSignupInput } from './schema'

/**
 * `WaitlistSignup.id` is `@default(cuid())`, which Prisma applies in the
 * client. A raw insert has to bring its own, and the only requirement on it is
 * uniqueness.
 */
function newId(): string {
  return `wls_${randomUUID().replace(/-/g, '')}`
}

/** `undefined` is not a value Postgres takes; an unanswered field is NULL. */
function orNull(value: string | undefined): string | null {
  return value ?? null
}

/**
 * Write the signup. Returns nothing, deliberately: there is no fact about the
 * list that a caller from the public internet is entitled to.
 */
export async function recordWaitlistSignup(
  input: WaitlistSignupInput,
  now: Date = new Date(),
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "WaitlistSignup"
      ("id", "email", "name", "company", "phone", "teamSize", "usesToday", "note", "source", "createdAt")
    VALUES (
      ${newId()},
      ${input.email},
      ${orNull(input.name)},
      ${orNull(input.company)},
      ${orNull(input.phone)},
      ${orNull(input.teamSize)},
      ${orNull(input.usesToday)},
      ${orNull(input.note)},
      ${orNull(input.source)},
      ${now}
    )
    ON CONFLICT ("email") DO UPDATE SET
      "name"      = COALESCE("WaitlistSignup"."name",      EXCLUDED."name"),
      "company"   = COALESCE("WaitlistSignup"."company",   EXCLUDED."company"),
      "phone"     = COALESCE("WaitlistSignup"."phone",     EXCLUDED."phone"),
      "teamSize"  = COALESCE("WaitlistSignup"."teamSize",  EXCLUDED."teamSize"),
      "usesToday" = COALESCE("WaitlistSignup"."usesToday", EXCLUDED."usesToday"),
      "note"      = COALESCE("WaitlistSignup"."note",      EXCLUDED."note"),
      "source"    = COALESCE("WaitlistSignup"."source",    EXCLUDED."source")
  `)
}
