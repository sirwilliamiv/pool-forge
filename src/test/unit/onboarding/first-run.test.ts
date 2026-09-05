// The setup checklist: what it says, when it says it, and how it goes away.
//
// The three steps are the three things that are empty on a new organisation and
// that a customer would see: placeholder prices, a proposal with no address,
// phone or licence number on it, and nothing drawn.

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import { initCommands } from '@/modules/commands/init'
import { dispatchCommand } from '@/modules/commands/dispatch'
import {
  buildFirstRunSteps,
  FIRST_RUN_SETTING_KEY,
  dismissFirstRun,
  loadFirstRun,
  type FirstRunFacts,
} from '@/modules/onboarding/first-run'
import { seedNewOrganization } from '@/modules/onboarding/seed-organization'
import { STARTER_PRICE_LINES } from '@/modules/onboarding/starter-price-book'

const RUN = Math.random().toString(36).slice(2, 8)

const NOTHING_DONE: FirstRunFacts = {
  placeholderLines: 12,
  priceBookLines: 12,
  hasAddress: false,
  hasPhone: false,
  hasLicenseNumber: false,
  hasDrawnShapes: false,
}

const step = (facts: FirstRunFacts, id: string) =>
  buildFirstRunSteps(facts).find((entry) => entry.id === id)

describe('what the checklist says', () => {
  it('names all three on a new organisation', () => {
    const steps = buildFirstRunSteps(NOTHING_DONE)
    expect(steps.map((entry) => entry.id)).toEqual(['price-book', 'company', 'drawing'])
    expect(steps.every((entry) => !entry.done)).toBe(true)
  })

  it('counts the prices still holding our numbers, and says they are not advice', () => {
    const detail = step(NOTHING_DONE, 'price-book')?.detail ?? ''
    expect(detail).toContain('12')
    expect(detail).toMatch(/not a recommendation/i)
  })

  it('names the company fields that are actually blank, not all of them', () => {
    const facts: FirstRunFacts = { ...NOTHING_DONE, hasAddress: true, hasPhone: true }
    const detail = step(facts, 'company')?.detail ?? ''
    expect(detail).toContain('licence number')
    expect(detail).not.toContain('address')
    expect(detail).not.toContain('phone')
  })

  it('ticks the company step only when all three are filled in', () => {
    const two: FirstRunFacts = { ...NOTHING_DONE, hasAddress: true, hasPhone: true }
    expect(step(two, 'company')?.done).toBe(false)
    expect(step({ ...two, hasLicenseNumber: true }, 'company')?.done).toBe(true)
  })

  it('ticks the price book step only once none of our numbers are left', () => {
    expect(step({ ...NOTHING_DONE, placeholderLines: 1 }, 'price-book')?.done).toBe(false)
    expect(step({ ...NOTHING_DONE, placeholderLines: 0 }, 'price-book')?.done).toBe(true)
  })

  it('does not tick the price book step for an empty book', () => {
    // Nothing to replace is not the same as having replaced it, and an empty
    // book is the original defect: every quote says it cannot be priced.
    const empty: FirstRunFacts = { ...NOTHING_DONE, placeholderLines: 0, priceBookLines: 0 }
    expect(step(empty, 'price-book')?.done).toBe(false)
    expect(step(empty, 'price-book')?.detail).toMatch(/cannot be priced/i)
  })

  it('links every step to the screen that finishes it', () => {
    for (const entry of buildFirstRunSteps(NOTHING_DONE)) {
      expect(entry.href.startsWith('/')).toBe(true)
      expect(entry.cta.length).toBeGreaterThan(0)
    }
  })
})

describe('against a real organisation', () => {
  let orgId = ''

  beforeEach(async () => {
    const org = await db.organization.create({ data: { name: `First run ${RUN}` } })
    orgId = org.id
  })

  it('shows all three steps outstanding the moment the organisation is seeded', async () => {
    await seedNewOrganization(orgId)
    const state = await loadFirstRun(orgId)
    expect(state.visible).toBe(true)
    expect(state.remaining).toBe(3)
    expect(state.steps[0]?.detail).toContain(String(STARTER_PRICE_LINES.length))
  })

  it('ticks the company step when the details are saved', async () => {
    await seedNewOrganization(orgId)
    await db.organization.update({
      where: { id: orgId },
      data: { address: '1 Pool Lane', phone: '555-0100', licenseNumber: 'CPC1234567' },
    })
    const state = await loadFirstRun(orgId)
    expect(state.steps.find((entry) => entry.id === 'company')?.done).toBe(true)
    expect(state.remaining).toBe(2)
  })

  it('ticks the drawing step when a project has shapes on it', async () => {
    await seedNewOrganization(orgId)
    const project = await db.project.create({ data: { orgId, name: `Job ${RUN}` } })
    await db.drawing.create({
      data: { projectId: project.id, rootJson: { shapes: [{ id: 'a' }] } },
    })
    const state = await loadFirstRun(orgId)
    expect(state.steps.find((entry) => entry.id === 'drawing')?.done).toBe(true)
  })

  it('does not tick the drawing step for a project nobody has drawn on', async () => {
    await seedNewOrganization(orgId)
    const project = await db.project.create({ data: { orgId, name: `Empty ${RUN}` } })
    await db.drawing.create({ data: { projectId: project.id, rootJson: { shapes: [] } } })
    const state = await loadFirstRun(orgId)
    expect(state.steps.find((entry) => entry.id === 'drawing')?.done).toBe(false)
  })

  it('stops counting a price the builder has changed', async () => {
    await seedNewOrganization(orgId)
    const shell = await db.priceBookItem.findFirstOrThrow({
      where: { priceBook: { orgId }, name: { startsWith: 'Pool shell' } },
    })
    await db.priceBookItem.update({ where: { id: shell.id }, data: { retailPrice: 118 } })
    const state = await loadFirstRun(orgId)
    expect(state.steps[0]?.detail).toContain(String(STARTER_PRICE_LINES.length - 1))
  })

  it('hides itself when the organisation dismisses it', async () => {
    await seedNewOrganization(orgId)
    await dismissFirstRun(orgId)
    const state = await loadFirstRun(orgId)
    expect(state.dismissed).toBe(true)
    expect(state.visible).toBe(false)
    // A dismissed card is hidden without computing the facts at all: the only
    // consumer gates on `visible` and reads `steps`, and re-deriving the
    // remaining count on every dashboard render for a card nobody will see is
    // exactly the work the short-circuit removes.
    expect(state.steps).toEqual([])
    expect(state.remaining).toBe(0)
  })

  it('is dismissed through the command registry, with an audit row', async () => {
    initCommands()
    await seedNewOrganization(orgId)
    const userId = (await db.user.create({
      data: {
        email: `first-run-${RUN}-${Math.random().toString(36).slice(2, 8)}@example.test`,
        passwordHash: 'x',
      },
    })).id

    const result = await dispatchCommand('settings.firstRun.dismiss', {}, { userId, orgId })
    expect(result.ok).toBe(true)

    const setting = await db.appSetting.findUnique({
      where: { orgId_key: { orgId, key: FIRST_RUN_SETTING_KEY } },
    })
    expect((setting?.value as { dismissed?: boolean })?.dismissed).toBe(true)

    const audit = await db.commandAuditLog.findFirst({
      where: { orgId, commandId: 'settings.firstRun.dismiss' },
    })
    expect(audit?.success).toBe(true)
  })

  it('refuses to dismiss anything for a caller with no organisation', async () => {
    // Refused at the door, not by a foreign key. Letting the write be attempted
    // and calling the database's complaint an authentication check would pass
    // this test while leaking a Prisma error message to the caller.
    const before = await db.appSetting.count()
    const result = await dispatchCommand('settings.firstRun.dismiss', {}, {
      userId: 'anonymous',
      orgId: 'anonymous',
    })
    expect(result.ok).toBe(false)
    expect(result.ok === false ? result.error : '').toBe('Not authenticated')
    expect(await db.appSetting.count()).toBe(before)
  })
})
