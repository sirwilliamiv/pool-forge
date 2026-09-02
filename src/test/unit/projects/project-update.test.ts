// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is never
// mocked here, per repo convention.
//
// `project.update` replaces the detail page's inline server action, and
// `project.status.set` replaces the second of the two places status could be
// set. These pin the writes now that the page dispatches commands: the
// project row, the customer split (site address on the project, billing
// address on the customer only when it differs), org scoping, and the
// previousStatus echo the undo toast replays.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import type { CommandContext, CommandResult } from '@/modules/commands/registry'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('project.update integration tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

async function run<T>(id: string, input: unknown, ctx: CommandContext): Promise<CommandResult<T>> {
  const command = get(id)
  if (!command) throw new Error(`${id} is not registered`)
  const parsed = command.inputSchema.parse(input)
  const result = await command.execute(parsed, ctx)
  if (result.ok) command.outputSchema.parse(result.data)
  return result as CommandResult<T>
}

const FIELDS = {
  name: 'Riverside rebuild',
  salesperson: 'Ray Delgado',
  designer: '',
  proposalExpiresAt: '2026-10-01',
  internalNotes: 'gate code 4411',
  jurisdiction: 'Hillsborough County, FL',
  parcelId: '0412-3456',
  siteAddress: '123 Poinciana Ave, Tampa, FL 33601, USA',
  sitePlaceId: 'place-123',
  latitude: 27.95,
  longitude: -82.46,
  customerName: 'Dana Reyes',
  customerEmail: 'dana@example.test',
  customerPhone: '813-555-0100',
  billingAddress: '',
  customerNotes: '',
  poolType: 'Gunite',
  interiorFinish: 'Quartz white',
  equipmentPackage: 'Pentair bundle',
  sanitizationPackage: 'Salt system',
  heaterSelection: 'MasterTemp 400',
  lightingSelection: '',
  deckMaterial: '',
  copingMaterial: '',
  screenOption: '',
  heaterSelected: true,
  saltSystemSelected: true,
  screenSelected: false,
  lightingQuantity: 0,
}

describe.skipIf(!reachable)('project.update and project.status.set', () => {
  let orgA = ''
  let orgB = ''
  let userId = ''
  let projectId = ''
  let ctxA: CommandContext
  let ctxB: CommandContext

  beforeAll(async () => {
    initCommands()
    orgA = (await db.organization.create({ data: { name: `Update A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Update B ${RUN}` } })).id
    userId = (
      await db.user.create({ data: { email: `update-${RUN}@example.test`, passwordHash: 'x' } })
    ).id
    projectId = (await db.project.create({ data: { orgId: orgA, name: 'Before' } })).id
    ctxA = { userId, orgId: orgA }
    ctxB = { userId, orgId: orgB }
  })

  afterAll(async () => {
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } })
    await db.user.deleteMany({ where: { id: userId } })
  })

  it('writes the project row, the site address, and a new customer in one save', async () => {
    const result = await run('project.update', { projectId, fields: FIELDS }, ctxA)
    expect(result.ok).toBe(true)

    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { customer: true },
    })
    expect(project.name).toBe('Riverside rebuild')
    expect(project.siteAddress).toBe(FIELDS.siteAddress)
    expect(project.sitePlaceId).toBe('place-123')
    expect(project.latitude).toBeCloseTo(27.95)
    expect(project.longitude).toBeCloseTo(-82.46)
    expect(project.jurisdiction).toBe('Hillsborough County, FL')

    // The customer exists, belongs to the org, and holds NO address: billing
    // was empty, which means "bill the site", which stores nothing.
    expect(project.customer?.name).toBe('Dana Reyes')
    expect(project.customer?.orgId).toBe(orgA)
    expect(project.customer?.address).toBeNull()

    const pool = project.poolFields as Record<string, unknown>
    expect(pool.sanitizationPackage).toBe('Salt system')
    expect(pool.saltSystemSelected).toBe(true)
    expect(pool.heaterSelection).toBe('MasterTemp 400')
  })

  it('keeps a billing address only when one is given', async () => {
    const result = await run(
      'project.update',
      { projectId, fields: { ...FIELDS, billingAddress: 'PO Box 12, Tampa, FL' } },
      ctxA,
    )
    expect(result.ok).toBe(true)
    const customer = await db.customer.findFirstOrThrow({ where: { orgId: orgA, name: 'Dana Reyes' } })
    expect(customer.address).toBe('PO Box 12, Tampa, FL')
  })

  it('clears the coordinates when the address was typed rather than picked', async () => {
    const result = await run(
      'project.update',
      {
        projectId,
        fields: { ...FIELDS, siteAddress: 'somewhere by hand', sitePlaceId: null, latitude: null, longitude: null },
      },
      ctxA,
    )
    expect(result.ok).toBe(true)
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.siteAddress).toBe('somewhere by hand')
    expect(project.sitePlaceId).toBeNull()
    expect(project.latitude).toBeNull()
    expect(project.longitude).toBeNull()
  })

  it('is org-scoped: another organisation cannot write this project', async () => {
    const result = await run('project.update', { projectId, fields: FIELDS }, ctxB)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('Project not found')
  })

  it('moves status and echoes where it came from', async () => {
    const result = await run<{ status: string; previousStatus: string }>(
      'project.status.set',
      { projectId, status: 'PROPOSAL_SENT' },
      ctxA,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.status).toBe('PROPOSAL_SENT')
      // The undo toast replays this value; a wrong echo undoes to the wrong place.
      expect(result.data.previousStatus).toBe('DRAFT')
    }
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.status).toBe('PROPOSAL_SENT')
  })

  it('is org-scoped on status too', async () => {
    const result = await run('project.status.set', { projectId, status: 'ARCHIVED' }, ctxB)
    expect(result.ok).toBe(false)
    const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
    expect(project.status).toBe('PROPOSAL_SENT')
  })
})
