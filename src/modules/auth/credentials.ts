// Checking a password, and moving an account across while we have it.
//
// Lives here rather than inside `lib/auth.ts` for one reason: `lib/auth.ts`
// constructs NextAuth at module load, so importing it into a unit test drags in
// the whole framework and its environment. This module is a pair of functions
// over a database row and an identity client, which is exactly what the tests
// need to reach. `authorize` calls into it and does nothing else with
// credentials.

import { db } from '@/lib/db'
import { logAuthWarning } from './errors'
import { identity, identityConfigured } from './identity'
import { verifyCredentialPassword } from './password'

export interface CredentialUser {
  id: string
  identityUid: string | null
  passwordHash: string | null
}

export type PasswordCheck =
  | { ok: false }
  | { ok: true; via: 'identity'; uid: string }
  | { ok: true; via: 'legacy' }

/**
 * Whether the password given is this account's, and who Identity Platform says
 * that account is.
 *
 * Identity Platform is asked first, because credentials live there now. The
 * local `passwordHash` column is asked second, and only ever answers for the
 * accounts that predate the switch: every account created since has a null hash,
 * and `verifyCredentialPassword` compares a null hash against a decoy and
 * returns false. So the fallback is not a way around the identity service, it is
 * a bridge for a finite and shrinking set of rows.
 *
 * BOTH PATHS RUN ON EVERY FAILURE, AND THAT IS THE POINT
 *
 * The local check is not skipped when Identity Platform has already refused. If
 * it were, a failed sign-in would cost one round trip for an address Identity
 * Platform knows and a round trip plus a bcrypt for one it does not, and a
 * stopwatch would sort a list of addresses into this product's customers and
 * everybody else. Every refusal costs the same: one identity call and one
 * bcrypt.
 *
 * The same reasoning is why `user` may be null and this still does the work: an
 * address with no row at all must cost what a real one costs.
 */
export async function checkPassword(
  user: Pick<CredentialUser, 'identityUid' | 'passwordHash'> | null,
  email: string,
  password: string,
): Promise<PasswordCheck> {
  if (identityConfigured()) {
    const verified = await identity().verifyPassword(email, password)
    if (verified.ok) return { ok: true, via: 'identity', uid: verified.data.uid }
  }
  const local = await verifyCredentialPassword(user?.passwordHash ?? null, password)
  return local ? { ok: true, via: 'legacy' } : { ok: false }
}

/**
 * Move an account that still has a local hash across to Identity Platform, on
 * the one occasion its password is known to be correct and in hand.
 *
 * This is the whole migration. Nobody is emailed, nobody is told to reset, and
 * the set of accounts on the old path drains as people sign in. The alternative
 * considered and rejected was a bulk import: Identity Platform can take bcrypt
 * hashes, but that needs a service-account credential and the project's signer
 * key, both of which this design deliberately does not hold, and it would move
 * dormant accounts that may never sign in again.
 *
 * Runs inline rather than fire-and-forget. A detached promise on a serverless
 * runtime may be killed when the response is sent, and an account half migrated
 * is worse than one not migrated at all. It is wrapped so a failure costs
 * latency and nothing else: the person still signs in, and the next sign-in
 * tries again.
 *
 * `email-exists` is left alone on purpose. It means Identity Platform holds that
 * address under some other password, and a browser API key cannot overwrite one.
 * Pointing the local row at an identity whose password nobody here knows would
 * lock the account out on its next sign-in.
 */
export async function migrateToIdentity(
  userId: string,
  email: string,
  password: string,
): Promise<'migrated' | 'deferred' | 'failed'> {
  try {
    const created = await identity().createUser(email, password)
    if (!created.ok) {
      if (created.failure !== 'email-exists') {
        // No address in the log line. An application log naming every account
        // that failed to migrate is a list of this product's customers.
        logAuthWarning('identity_migration_deferred', {
          reason: created.failure,
          ...(created.ref ? { errorRef: created.ref } : {}),
        })
      }
      return 'deferred'
    }
    await db.user.update({
      where: { id: userId },
      data: { identityUid: created.data.uid, passwordHash: null },
    })
    return 'migrated'
  } catch (cause) {
    logAuthWarning('identity_migration_failed', { cause: String(cause) })
    return 'failed'
  }
}

/**
 * The local row and Identity Platform disagree about the uid. Happens when a
 * previous migration wrote one and then failed, or when an account was
 * provisioned out of band. The service has just proved the password, so it is
 * the one to believe.
 */
export async function reconcileIdentityUid(userId: string, uid: string): Promise<void> {
  try {
    await db.user.update({
      where: { id: userId },
      data: { identityUid: uid, passwordHash: null },
    })
  } catch (cause) {
    logAuthWarning('identity_uid_reconcile_failed', { cause: String(cause) })
  }
}
