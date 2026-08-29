'use server'

// "I have forgotten my password."
//
// THE ONLY REQUIREMENT THAT MATTERS HERE
//
// The answer must be identical whether or not the address has an account.
// Identical wording, identical shape, identical everything a browser can see.
// The moment it is not, this form is a machine for sorting a list of email
// addresses into this product's customers and everybody else, and that list is
// worth more to whoever is asking than any single password.
//
// So: one return value, `{ ok: true }`, on every path that is not the throttle.
// No "we could not find that account". No redirect that only happens sometimes.
// Errors inside the domain module are swallowed there for the same reason.
//
// DELIBERATELY NOT A REGISTRY COMMAND
//
// Every other user action in this codebase dispatches through the command
// registry so it lands in `CommandAuditLog`. This one does not, and the reason
// is the same requirement. There is no session, so the row would have a null
// user and a null org, and its `inputJson` would be an email address. That table
// would become a list of every address anybody ever typed into this box, which
// `modules/auth/errors.ts` already argues at length is a list of this product's
// customers. Sign-in is outside the registry for the same reason and by the same
// precedent. What DOES get audited is the half that has a session and an
// organisation: an owner minting a link for a team member, via
// `team.member.resetPassword`.

import { headers } from 'next/headers'
import { z } from 'zod'

import { consumeResetRequest } from '@/modules/auth/rate-limit'
import { authClientIpBucket } from '@/modules/auth/request-ip'
import { RESET_REQUESTED, RESET_THROTTLED, requestPasswordReset } from '@/modules/auth/password-reset'
import { hashToken, mintToken, normalizeEmail } from '@/modules/auth/tokens'
import { appUrl, sendEmail } from '@/modules/email/send'

export type ForgotPasswordResult = { ok: true; message: string } | { ok: false; error: string }

const formSchema = z.object({ email: z.string().trim().min(1).max(254) })

export async function forgotPasswordAction(formData: FormData): Promise<ForgotPasswordResult> {
  const parsed = formSchema.safeParse({ email: formData.get('email') ?? '' })
  // Even a malformed address gets the same sentence. "That is not a valid email"
  // would be harmless on its own, but it is one more thing that varies with the
  // input, and the whole discipline of this action is that nothing does.
  if (!parsed.success) return { ok: true, message: RESET_REQUESTED }

  const email = normalizeEmail(parsed.data.email)

  try {
    const ipBucket = authClientIpBucket(await headers())
    const gate = await consumeResetRequest(ipBucket, email)
    if (!gate.allowed) return { ok: false, error: RESET_THROTTLED }
  } catch {
    // Fail closed on the ceiling, but not in a way that varies by address: the
    // throttle sentence is the same for everybody who hits it.
    return { ok: false, error: RESET_THROTTLED }
  }

  // Minted before anything is looked up, so no branch depends on it. The raw
  // value lives in this function and, if the local channel runs, in one email.
  // It is never logged, never returned, and never written to the database: only
  // its sha256 is.
  const token = mintToken()

  const outcome = await requestPasswordReset({ email, tokenHash: hashToken(token) })

  if (outcome.channel === 'local') {
    // Identity Platform sends its own mail, so this only runs for accounts that
    // predate it. `sendEmail` reports honestly when there is no provider; there
    // is nothing to do about that here, because telling this caller would be
    // telling them the address exists.
    await sendEmail({
      to: email,
      subject: 'Set a new Pool Forge password',
      body: [
        'Somebody asked to reset the password for this Pool Forge account.',
        '',
        appUrl(`/reset-password/${token}`),
        '',
        'The link works once and expires in an hour.',
        'If this was not you, nothing has changed and you can ignore this message.',
      ].join('\n'),
    })
  }

  return { ok: true, message: RESET_REQUESTED }
}
