#!/usr/bin/env tsx
/**
 * Mint a password reset link for an existing account.
 *
 *   pnpm tsx scripts/reset-password-link.ts --email sam@acme.com --app-url https://...
 *
 * The app already has a self-service reset at /forgot-password, and that is the
 * path everybody should use. It emails the link, and until a mail provider is
 * configured it emails nothing, which leaves an invited builder locked out with
 * no way back in. This is the operator's stopgap for exactly that window: run it
 * against a known DATABASE_URL and hand the link over yourself.
 *
 * It prints a link, never a password. The new password is chosen by the account
 * holder in their own browser, so nothing worth stealing is left behind in a
 * terminal history.
 *
 * One live link per address: any outstanding reset is retired first, because two
 * valid links to one account is twice the exposure for no benefit.
 *
 * Delete this once email is configured. It is a workaround with a shelf life.
 */
import { db } from '../src/lib/db'
import { mintLocalPasswordReset } from '../src/modules/auth/password-reset'
import { PASSWORD_RESET_TTL_MS, hashToken, mintToken, normalizeEmail } from '../src/modules/auth/tokens'

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const raw = arg('--email')?.trim()
  if (!raw) throw new Error('Usage: reset-password-link.ts --email person@example.com [--app-url https://...]')

  const email = normalizeEmail(raw)
  const appUrl = (arg('--app-url') ?? process.env.APP_URL ?? 'http://localhost:3001').replace(/\/+$/, '')

  const user = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) {
    // Said plainly. This runs on a machine that already holds the database
    // credentials, so there is nobody here to protect from knowing whether an
    // account exists, and a silent success would send somebody a dead link.
    throw new Error(`No account for ${email}. Invite them with scripts/bootstrap-owner.ts instead.`)
  }

  const token = mintToken()
  const { expiresAt } = await mintLocalPasswordReset({
    userId: user.id,
    email,
    tokenHash: hashToken(token),
  })

  const minutes = Math.round(PASSWORD_RESET_TTL_MS / 60_000)
  console.log('')
  console.log(`Password reset for ${email}, good for ${minutes} minutes and one use:`)
  console.log('')
  console.log(`  ${appUrl}/reset-password/${token}`)
  console.log('')
  console.log('Any earlier unspent reset link for this address is now dead.')
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
  .finally(() => {
    void db.$disconnect()
  })
