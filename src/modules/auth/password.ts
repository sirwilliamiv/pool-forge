// Verifying a submitted password without answering "does this account exist".
//
// The obvious implementation returns early when the address is unknown:
//
//   const user = await db.user.findUnique(...)
//   if (!user) return null
//   return bcrypt.compare(password, user.passwordHash)
//
// That early return skips a deliberately expensive hash. bcrypt at cost 12 is
// hundreds of milliseconds and the lookup that precedes it is a fraction of one,
// so the two paths differ by an order of magnitude and anyone with a stopwatch
// can sort a list of addresses into customers and non-customers without ever
// guessing a password. Rate limiting does not close that gap: a handful of
// attempts per address is plenty to time it, and the answer is worth more than
// the login.
//
// So an unknown address is compared against a real hash of a value nobody holds,
// and both paths do the same work and fail the same way.

import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

/** Matches the cost `registerUser` writes with, so both paths cost the same. */
const BCRYPT_COST = 12

/**
 * Computed once per process rather than checked in: a constant in the repository
 * would be a published hash that everyone deploying this product shares, and it
 * would read like a credential to the next person who found it.
 */
let decoyHash: string | null = null

function unknownUserHash(): string {
  if (decoyHash === null) {
    decoyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), BCRYPT_COST)
  }
  return decoyHash
}

/**
 * True when `password` matches `storedHash`. A null hash, meaning no such
 * account, always returns false, but only after doing the same work.
 */
export async function verifyCredentialPassword(
  storedHash: string | null,
  password: string,
): Promise<boolean> {
  const hash = storedHash ?? unknownUserHash()
  const matched = await bcrypt.compare(password, hash)
  return storedHash !== null && matched
}

/** Warm the decoy hash so the first unknown address is not the fast one. */
export function primeUnknownUserHash(): void {
  unknownUserHash()
}
