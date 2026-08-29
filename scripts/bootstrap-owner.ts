#!/usr/bin/env tsx
/**
 * Open an organisation and invite its first owner.
 *
 *   pnpm tsx scripts/bootstrap-owner.ts --org "Acme Pools" --email sam@acme.com
 *
 * Every other account in Pool Forge is invited by somebody already inside. The
 * first one cannot be, so this is the only door that opens from the outside,
 * and it is deliberately a command run by hand against a known DATABASE_URL
 * rather than an endpoint the deployed app exposes.
 *
 * It mints an invite rather than an account: the password is set by the person
 * who receives the link, in their own browser, and never exists anywhere else.
 * An operator who runs this learns a URL, not a credential, so there is nothing
 * in the terminal history worth stealing after the link is spent.
 *
 * Idempotent in the way that matters: an organisation of the same name is
 * reused rather than duplicated, and re-running mints a fresh link when the
 * last one was lost. Old unspent invites for the same address are retired so
 * exactly one link is live at a time.
 */
import { db } from '../src/lib/db'
import { INVITE_TTL_MS, hashToken, mintToken, normalizeEmail } from '../src/modules/auth/tokens'

interface Args {
  org: string
  email: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER'
  appUrl: string
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }

  const org = get('--org')?.trim()
  const email = get('--email')?.trim()
  const role = (get('--role') ?? 'OWNER').toUpperCase()
  const appUrl = (get('--app-url') ?? process.env.APP_URL ?? 'http://localhost:3001').replace(/\/+$/, '')

  if (!org || !email) {
    throw new Error('Usage: bootstrap-owner.ts --org "Name" --email person@example.com [--role OWNER] [--app-url https://...]')
  }
  if (role !== 'OWNER' && role !== 'ADMIN' && role !== 'MEMBER') {
    throw new Error(`--role must be OWNER, ADMIN or MEMBER, not ${role}`)
  }
  return { org, email, role, appUrl }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const email = normalizeEmail(args.email)

  const existingOrg = await db.organization.findFirst({
    where: { name: args.org },
    select: { id: true, name: true },
  })
  const org = existingOrg ?? (await db.organization.create({
    data: { name: args.org },
    select: { id: true, name: true },
  }))
  console.log(`${existingOrg ? 'Using' : 'Created'} organisation ${org.name} (${org.id})`)

  // One live link per address. A lost invite should be replaced, not
  // accumulated: two valid links to the same account is two chances to leak one.
  const retired = await db.authToken.updateMany({
    where: { kind: 'INVITE', email, usedAt: null },
    data: { usedAt: new Date() },
  })
  if (retired.count > 0) console.log(`Retired ${retired.count} unspent invite(s) for this address`)

  const token = mintToken()
  await db.authToken.create({
    data: {
      kind: 'INVITE',
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      orgId: org.id,
      role: args.role,
    },
  })

  const days = Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000))
  console.log('')
  console.log(`Invite for ${email} as ${args.role}, good for ${days} days and one use:`)
  console.log('')
  console.log(`  ${args.appUrl}/invite/${token}`)
  console.log('')
  console.log('They set their own password on that page and land signed in.')
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
  .finally(() => {
    void db.$disconnect()
  })
