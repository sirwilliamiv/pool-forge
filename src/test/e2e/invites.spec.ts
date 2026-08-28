// Invite only, end to end, through a real browser against a real server and a
// real database.
//
// The unit suite proves each piece. What it cannot prove is that the pieces are
// wired to the screens a person actually touches, which is this codebase's most
// reliable defect: something registered, reported as working, and connected to
// nothing. So every assertion below starts with a click and ends with a row.
//
// Identity Platform is deliberately NOT configured for this run (see
// `playwright.config.ts`), so what is exercised here is the local-password path
// an unconfigured deployment uses. The live service is proved separately, by an
// end-to-end run against the real project.
//
// Everything this file creates is prefixed with a run-scoped id and deleted at
// both ends, so a rerun starts from a known state and nothing leaks into the
// seeded demo data.

import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'

const db = new PrismaClient()

const DEMO_EMAIL = 'demo@poolforge.test'
const DEMO_PASSWORD = 'demo1234'

const RUN = randomUUID().slice(0, 8)

function addr(label: string): string {
  return `e2e-${RUN}-${label}@example.test`
}

async function wipe(): Promise<void> {
  await db.authToken.deleteMany({ where: { email: { contains: `e2e-${RUN}-` } } })
  await db.organizationMember.deleteMany({
    where: { user: { email: { contains: `e2e-${RUN}-` } } },
  })
  await db.user.deleteMany({ where: { email: { contains: `e2e-${RUN}-` } } })
  await db.$executeRawUnsafe(`DELETE FROM "RateLimitCounter" WHERE "key" LIKE '%198.51.100.%'`)
}

test.beforeAll(async () => {
  await wipe()
})

test.afterAll(async () => {
  await wipe()
  await db.$disconnect()
})

/** Sign in as the seeded demo owner. */
async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(DEMO_EMAIL)
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
}

/**
 * Invite an address from the team screen and return the link the page hands back.
 *
 * There is no mail provider configured, and that is the case this beta actually
 * runs in: the invite still succeeds and the link is offered to copy. Reading it
 * off the screen is also the only honest way to get it, since the database holds
 * a hash and nothing else.
 */
async function inviteFromTeamScreen(
  page: Page,
  email: string,
  role: 'Owner' | 'Admin' | 'Member',
): Promise<string> {
  await page.goto('/settings/team')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Role', { exact: true }).selectOption({ label: role })
  await page.getByRole('button', { name: /send invite/i }).click()

  const link = page.getByTestId('invite-link')
  await expect(link).toBeVisible({ timeout: 30_000 })
  const value = await link.inputValue()
  expect(value).toContain('/invite/')
  return value
}

test.describe('inviting somebody', () => {
  test('invite, follow the link, set a password, land signed in with the right role', async ({
    browser,
  }) => {
    const owner = await browser.newContext()
    const ownerPage = await owner.newPage()
    await signInAsDemo(ownerPage)

    const email = addr('joiner')
    const link = await inviteFromTeamScreen(ownerPage, email, 'Admin')

    // It shows as pending on the team screen before it is used.
    await expect(ownerPage.getByTestId('invite-table')).toContainText(email)

    // And nothing tells the inviter an email went out, because none did.
    await expect(ownerPage.getByTestId('team-result')).toContainText(/no email was sent/i)

    // A brand new visitor, with no cookies from the inviter.
    const joiner = await browser.newContext()
    const joinerPage = await joiner.newPage()
    await joinerPage.goto(link)

    await expect(joinerPage.getByText(email)).toBeVisible()
    await joinerPage.getByLabel(/your name/i).fill('Jo Joiner')
    await joinerPage.getByLabel(/choose a password/i).fill('a-good-password')
    await joinerPage.getByRole('button', { name: /join/i }).click()

    // Signed straight in: they proved the mailbox and chose the password, so a
    // second login form would be friction with no security in it.
    await joinerPage.waitForURL(/\/dashboard/, { timeout: 60_000 })
    const cookies = await joiner.cookies()
    expect(cookies.some((cookie) => cookie.name.includes('authjs.session-token'))).toBe(true)

    // The row is what actually matters: the right person, the right team, the
    // right role.
    const created = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, memberships: { select: { role: true, org: true } } },
    })
    expect(created?.name).toBe('Jo Joiner')
    expect(created?.memberships).toHaveLength(1)
    expect(created?.memberships[0]?.role).toBe('ADMIN')
    expect(created?.memberships[0]?.org.name).toBe('Pool Forge Demo Co')

    // The invite has left the pending list and joined the member list.
    await ownerPage.goto('/settings/team')
    await expect(ownerPage.getByTestId('member-table')).toContainText(email)
    await expect(ownerPage.getByTestId('invite-table')).toHaveCount(0)

    // A used link is refused, in the words of somebody who should just sign in.
    const second = await browser.newContext()
    const secondPage = await second.newPage()
    await secondPage.goto(link)
    await expect(secondPage.getByText(/already been used/i)).toBeVisible()
    // And no second account came out of it.
    expect(await db.user.count({ where: { email } })).toBe(1)

    await owner.close()
    await joiner.close()
    await second.close()
  })

  test('an expired link is refused and creates nothing', async ({ browser }) => {
    const owner = await browser.newContext()
    const ownerPage = await owner.newPage()
    await signInAsDemo(ownerPage)

    const email = addr('expired')
    const link = await inviteFromTeamScreen(ownerPage, email, 'Member')

    // Age the row rather than waiting a week for it.
    const token = link.split('/invite/')[1] ?? ''
    const updated = await db.authToken.updateMany({
      where: { tokenHash: createHash('sha256').update(decodeURIComponent(token)).digest('hex') },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    })
    // Guards the guard: if the hash did not match, the assertion below would
    // pass for the wrong reason.
    expect(updated.count).toBe(1)

    const visitor = await browser.newContext()
    const visitorPage = await visitor.newPage()
    await visitorPage.goto(link)
    await expect(visitorPage.getByText(/expired/i)).toBeVisible()
    expect(await db.user.count({ where: { email } })).toBe(0)

    await owner.close()
    await visitor.close()
  })

  test('a cancelled invite stops working', async ({ browser }) => {
    const owner = await browser.newContext()
    const ownerPage = await owner.newPage()
    await signInAsDemo(ownerPage)

    const email = addr('revoked')
    const link = await inviteFromTeamScreen(ownerPage, email, 'Member')

    await ownerPage.goto('/settings/team')
    await ownerPage
      .getByTestId('invite-row')
      .filter({ hasText: email })
      .getByRole('button', { name: /cancel invite/i })
      .click()
    await expect(ownerPage.getByTestId('team-result')).toContainText(/no longer works/i)

    const visitor = await browser.newContext()
    const visitorPage = await visitor.newPage()
    await visitorPage.goto(link)
    await expect(visitorPage.getByText(/cannot be used/i)).toBeVisible()
    expect(await db.user.count({ where: { email } })).toBe(0)

    await owner.close()
    await visitor.close()
  })

  test('the last owner cannot be removed or demoted', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/settings/team')

    // The demo organisation has exactly one owner, and it is the viewer, so both
    // controls are off. Two rules meet here and either one alone would do it,
    // which is the point: there is no arrangement of clicks that empties the
    // owner seat.
    const row = page.getByTestId('member-row').filter({ hasText: DEMO_EMAIL })
    await expect(row.getByRole('button', { name: /remove/i })).toBeDisabled()
    await expect(row.getByRole('combobox')).toBeDisabled()
    expect(
      await db.organizationMember.count({
        where: { org: { name: 'Pool Forge Demo Co' }, role: 'OWNER' },
      }),
    ).toBe(1)
  })
})

test.describe('signing yourself up', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.21' } })

  test('creates no account', async ({ page }) => {
    // The page at /register belongs to another track and may be a waitlist by
    // now, so this test does not assume a form is there. What it asserts is the
    // part that is this track's promise: whatever that page does, no `User` row
    // comes out of it and no session is issued.
    const email = addr('walkup')
    const before = await db.user.count()

    await page.goto('/register')
    const emailField = page.getByLabel(/email/i).first()
    if (await emailField.isVisible().catch(() => false)) {
      await emailField.fill(email)
      const password = page.getByLabel(/password/i).first()
      if (await password.isVisible().catch(() => false)) {
        await password.fill('a-good-password')
      }
      await page.getByRole('button').first().click()
      await page.waitForTimeout(2_000)
    }

    expect(await db.user.count({ where: { email } })).toBe(0)
    expect(await db.user.count()).toBe(before)
    expect(page.url()).not.toContain('/dashboard')
    const cookies = await page.context().cookies()
    expect(cookies.some((c) => c.name.includes('authjs.session-token'))).toBe(false)
  })
})

test.describe('forgotten password', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.42' } })

  test('answers a known and an unknown address identically', async ({ page }) => {
    // The property this whole flow is built around. If these two transcripts
    // differ in any way a browser can see, the form is a machine for sorting a
    // list of addresses into this product's customers and everybody else.
    async function ask(email: string): Promise<{ text: string; url: string }> {
      await page.goto('/forgot-password')
      await page.getByLabel(/email/i).fill(email)
      await page.getByRole('button', { name: /send the link/i }).click()
      const result = page.getByTestId('reset-result')
      await expect(result).toBeVisible({ timeout: 30_000 })
      return { text: (await result.innerText()).trim(), url: page.url() }
    }

    const known = await ask(DEMO_EMAIL)
    const unknown = await ask(addr('nobody'))

    expect(unknown).toEqual(known)
    // And the sentence itself commits to nothing.
    expect(known.text).toMatch(/if that address has a pool forge account/i)
    expect(known.text).not.toContain(DEMO_EMAIL)

    // Underneath, the two really did take different paths, which is what makes
    // the sameness above worth asserting rather than trivially true.
    expect(
      await db.authToken.count({ where: { email: DEMO_EMAIL, kind: 'PASSWORD_RESET' } }),
    ).toBeGreaterThan(0)
    expect(await db.authToken.count({ where: { email: addr('nobody') } })).toBe(0)

    await db.authToken.deleteMany({ where: { email: DEMO_EMAIL, kind: 'PASSWORD_RESET' } })
  })

  test('an owner can hand a member a link, and it sets a new password once', async ({
    browser,
  }) => {
    const owner = await browser.newContext()
    const ownerPage = await owner.newPage()
    await signInAsDemo(ownerPage)

    // A member to reset. Created through the front door so the row is real.
    const email = addr('forgetful')
    const link = await inviteFromTeamScreen(ownerPage, email, 'Member')
    const joiner = await browser.newContext()
    const joinerPage = await joiner.newPage()
    await joinerPage.goto(link)
    await joinerPage.getByLabel(/choose a password/i).fill('first-password')
    await joinerPage.getByRole('button', { name: /join/i }).click()
    await joinerPage.waitForURL(/\/dashboard/, { timeout: 60_000 })
    await joiner.close()

    await ownerPage.goto('/settings/team')
    await ownerPage
      .getByTestId('member-row')
      .filter({ hasText: email })
      .getByRole('button', { name: /password link/i })
      .click()
    const resetLink = ownerPage.getByTestId('invite-link')
    await expect(resetLink).toBeVisible({ timeout: 30_000 })
    const resetUrl = await resetLink.inputValue()
    expect(resetUrl).toContain('/reset-password/')

    const returning = await browser.newContext()
    const returningPage = await returning.newPage()
    await returningPage.goto(resetUrl)
    await returningPage.getByLabel(/new password/i).fill('second-password')
    await returningPage.getByRole('button', { name: /save and sign in/i }).click()
    await returningPage.waitForURL(/\/dashboard/, { timeout: 60_000 })

    // The new password works and the link does not work twice.
    const again = await browser.newContext()
    const againPage = await again.newPage()
    await againPage.goto(resetUrl)
    await expect(againPage.getByText(/already been used/i)).toBeVisible()

    await owner.close()
    await returning.close()
    await again.close()
  })
})
