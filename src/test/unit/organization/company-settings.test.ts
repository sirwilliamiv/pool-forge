// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// The defect: company settings held four fields, so a builder had nowhere to
// put their address, their phone number or their contractor licence, and the
// proposal a customer signs went out without any of them.
//
// The second defect, quieter: the save was a server action writing Prisma
// directly. `CLAUDE.md` requires every user action through the command
// registry, and the reason bites here specifically. Changing the licence number
// printed on a contract left no audit row at all.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { dispatchCommand } from '@/modules/commands/dispatch'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import {
  SUGGESTED_PAYMENT_SCHEDULE,
  parsePaymentSchedule,
  type CompanySettingsInput,
} from '@/modules/organization/company'

const RUN = randomUUID().slice(0, 8)
const COMMAND = 'settings.company.update'

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('company settings tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

function input(overrides: Partial<CompanySettingsInput> = {}): CompanySettingsInput {
  return {
    name: `Blue Water Pools ${RUN}`,
    logoUrl: '',
    brandColor: '#0284c7',
    taxRatePct: 6,
    address: '1200 Gulf Blvd, Suite 4, Tampa FL 33606',
    phone: '813-555-0180',
    email: 'office@bluewater.test',
    licenseNumber: 'CPC1457893',
    proposalTerms: 'Our own wording, not yours.',
    proposalValidDays: 45,
    paymentSchedule: SUGGESTED_PAYMENT_SCHEDULE,
    ...overrides,
  }
}

describe.skipIf(!reachable)('settings.company.update', () => {
  let orgA = ''
  let orgB = ''
  // A real User row: the audit write carries a foreign key, so a made-up id
  // fails the insert and `writeAudit` swallows it. A test that asserted on an
  // invented user would have been asserting that the audit log stays empty.
  let userId = ''

  beforeAll(async () => {
    initCommands()
    orgA = (await db.organization.create({ data: { name: `Company A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Company B ${RUN}` } })).id
    userId = (
      await db.user.create({
        data: {
          email: `company-${RUN}@poolforge.test`,
          name: 'Owner',
          passwordHash: 'not-a-real-hash',
        },
      })
    ).id
  })

  afterAll(async () => {
    if (!reachable) return
    await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  beforeEach(async () => {
    await db.commandAuditLog.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
  })

  it('is registered and is not a stub', () => {
    const cmd = get(COMMAND)
    expect(cmd?.category).toBe('settings')
    expect(cmd?.unimplemented).toBeUndefined()
  })

  it('is never offered to the voice agent', () => {
    // A licence number, a terms paragraph and a draw schedule are contract
    // content. The converter refuses any command with no voice examples, which
    // is how this one stays out of the agent's reach.
    expect(get(COMMAND)?.voiceExamples).toBeUndefined()
  })

  it('stores everything a proposal has to print', async () => {
    const result = await dispatchCommand(COMMAND, input(), { userId, orgId: orgA })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)

    const org = await db.organization.findUniqueOrThrow({ where: { id: orgA } })
    expect(org.address).toBe('1200 Gulf Blvd, Suite 4, Tampa FL 33606')
    expect(org.phone).toBe('813-555-0180')
    expect(org.email).toBe('office@bluewater.test')
    expect(org.licenseNumber).toBe('CPC1457893')
    expect(org.proposalTerms).toBe('Our own wording, not yours.')
    expect(org.proposalValidDays).toBe(45)
    expect(org.taxRatePct).toBe(6)
    expect(parsePaymentSchedule(org.paymentSchedule)).toEqual(SUGGESTED_PAYMENT_SCHEDULE)
  })

  it('writes an audit row, which the old server action did not', async () => {
    await dispatchCommand(COMMAND, input({ licenseNumber: 'CPC9999999' }), {
      userId,
      orgId: orgA,
    })
    const rows = await db.commandAuditLog.findMany({ where: { orgId: orgA, commandId: COMMAND } })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.success).toBe(true)
  })

  it('clears a field the builder emptied rather than storing a blank string', async () => {
    await dispatchCommand(COMMAND, input(), { userId, orgId: orgA })
    await dispatchCommand(COMMAND, input({ licenseNumber: '', proposalTerms: '' }), {
      userId,
      orgId: orgA,
    })
    const org = await db.organization.findUniqueOrThrow({ where: { id: orgA } })
    expect(org.licenseNumber).toBeNull()
    // Null is what makes the document fall back to the default wording, rather
    // than printing an empty Terms heading.
    expect(org.proposalTerms).toBeNull()
  })

  it('refuses a payment schedule that does not cover the contract', async () => {
    const result = await dispatchCommand(
      COMMAND,
      input({ paymentSchedule: [{ label: 'Deposit', percent: 10 }] }),
      { userId, orgId: orgA },
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('100%')

    const org = await db.organization.findUniqueOrThrow({ where: { id: orgA } })
    expect(parsePaymentSchedule(org.paymentSchedule)).not.toEqual([
      { label: 'Deposit', percent: 10 },
    ])
  })

  it('refuses a brand colour that is not a colour', async () => {
    const result = await dispatchCommand(COMMAND, input({ brandColor: 'cornflower blue' }), {
      userId,
      orgId: orgA,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a logo that is not a link to an image', async () => {
    const result = await dispatchCommand(
      COMMAND,
      input({ logoUrl: 'javascript:alert(1)' }),
      { userId, orgId: orgA },
    )
    expect(result.ok).toBe(false)
  })

  it('refuses a caller with no organisation', async () => {
    const result = await dispatchCommand(COMMAND, input(), {
      userId: 'anonymous',
      orgId: 'anonymous',
    })
    expect(result.ok).toBe(false)
  })

  it('writes only the caller organisation', async () => {
    await dispatchCommand(COMMAND, input({ licenseNumber: 'CPC1111111' }), {
      userId,
      orgId: orgA,
    })
    const other = await db.organization.findUniqueOrThrow({ where: { id: orgB } })
    expect(other.licenseNumber).toBeNull()
  })

  it('refuses an empty company name', async () => {
    const result = await dispatchCommand(COMMAND, input({ name: '   ' }), {
      userId,
      orgId: orgA,
    })
    expect(result.ok).toBe(false)
  })
})
