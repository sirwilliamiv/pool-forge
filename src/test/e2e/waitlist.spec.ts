// Drives the real front door against the real server and the real table.
//
// The unit tests prove the handler's properties. What they cannot prove is that
// the handler is in the path a browser actually takes: a limiter wired into a
// module nobody calls, or a form posting to the wrong place, is indistinguishable
// from no limiter and no form until somebody opens the page.
//
// Each test invents its own client address via `X-Forwarded-For`, taken from the
// TEST-NET-2 documentation range, so no test can spend another test's budget and
// nothing here touches the bucket a developer's own browser counts under. The
// rows are deleted at both ends.

import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const RUN = Date.now().toString(36)

/** Distinct documentation addresses, one per scenario. */
const IP_FIRST_VISIT = '198.51.100.11'
const IP_SECOND_VISIT = '198.51.100.22'
const IP_FLOODER = '198.51.100.33'

const email = (label: string) => `e2e-waitlist-${RUN}-${label}@example.test`

interface Filled {
  email: string
  name?: string
  company?: string
  teamSize?: string
  usesToday?: string
}

async function submit(page: Page, filled: Filled): Promise<void> {
  await page.goto('/request-access')
  await page.getByLabel('Email', { exact: true }).fill(filled.email)
  if (filled.name !== undefined) await page.getByLabel('Your name').fill(filled.name)
  if (filled.company !== undefined) await page.getByLabel('Company').fill(filled.company)
  if (filled.teamSize !== undefined) {
    await page.getByLabel('How many people would use it').selectOption(filled.teamSize)
  }
  if (filled.usesToday !== undefined) {
    await page.getByLabel('What you estimate with today').selectOption(filled.usesToday)
  }
  await page.getByRole('button', { name: 'Request access' }).click()
  await Promise.race([
    page.getByTestId('waitlist-done').waitFor({ state: 'visible', timeout: 30_000 }),
    page.getByTestId('waitlist-error').waitFor({ state: 'visible', timeout: 30_000 }),
  ])
}

async function cleanup(): Promise<void> {
  await db.$executeRawUnsafe(
    `DELETE FROM "WaitlistSignup" WHERE "email" LIKE 'e2e-waitlist-%@example.test'`,
  )
  await db.$executeRawUnsafe(`DELETE FROM "RateLimitCounter" WHERE "key" LIKE '%198.51.100.%'`)
}

test.beforeAll(cleanup)
test.afterAll(async () => {
  await cleanup()
  await db.$disconnect()
})

test.describe('the front door', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': IP_FIRST_VISIT } })

  test('says what the product is, and does not promise what it cannot do', async ({ page }) => {
    await page.goto('/request-access')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Draw the pool. The price is already done.',
    )
    // The scarcity is stated as a decision with a reason behind it.
    await expect(page.getByText('Invite only while it is early')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Why access is limited' })).toBeVisible()
    // What the software does not do moved off the page and into
    // docs/feature-list.md; the page must no longer carry the section.
    await expect(page.getByRole('heading', { name: 'What it does not do yet' })).toHaveCount(0)
  })

  test('is where /register goes, now that nobody can sign themselves up', async ({ page }) => {
    await page.goto('/register')
    await expect(page).toHaveURL(/\/request-access$/)
    await expect(page.getByRole('button', { name: 'Request access' })).toBeVisible()
  })

  test('puts a builder in the pipeline with the two answers that matter', async ({ page }) => {
    const address = email('pipeline')
    await submit(page, {
      email: address,
      name: 'Sam Rivera',
      company: 'Rivera Pools',
      teamSize: '6-15',
      usesToday: 'spreadsheet',
    })

    await expect(page.getByTestId('waitlist-done')).toContainText('You are on the list')

    const row = await db.waitlistSignup.findUnique({ where: { email: address } })
    expect(row).not.toBeNull()
    expect(row?.name).toBe('Sam Rivera')
    expect(row?.company).toBe('Rivera Pools')
    expect(row?.teamSize).toBe('6-15')
    expect(row?.usesToday).toBe('spreadsheet')
    expect(row?.invitedAt).toBeNull()
  })
})

test('a stranger cannot find out who is already on the list', async ({ browser }) => {
  // The oracle this rules out: if a repeat address read differently, anyone
  // could type a competitor's sales address into the only public form on the
  // site and learn whether that company has been talking to us.
  const address = email('oracle')

  async function transcript(ip: string, name: string): Promise<string> {
    const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip } })
    const page = await context.newPage()
    try {
      await submit(page, { email: address, name })
      // Everything above the standing "Already have an account?" line, which is
      // the same on every visit and is the one place the word "already" is
      // allowed to appear.
      const panel = (await page.getByTestId('waitlist-done').innerText()).trim()
      return panel.split('Already have an account?')[0]?.trim() ?? panel
    } finally {
      await context.close()
    }
  }

  const first = await transcript(IP_FIRST_VISIT, 'Sam Rivera')
  const second = await transcript(IP_SECOND_VISIT, 'Impostor')

  expect(second).toBe(first)
  expect(second).not.toMatch(/already|again|exist|duplicate|previous|know you/i)

  // And the second submission changed nothing it found.
  const rows = await db.waitlistSignup.findMany({ where: { email: address } })
  expect(rows).toHaveLength(1)
  expect(rows[0]?.name).toBe('Sam Rivera')
})

test.describe('one address submitting over and over', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': IP_FLOODER } })

  test('is let through five times an hour and then refused', async ({ page }) => {
    for (let i = 0; i < 5; i += 1) {
      await submit(page, { email: email(`flood-${i}`) })
      await expect(page.getByTestId('waitlist-done')).toBeVisible()
    }

    await submit(page, { email: email('flood-last') })

    await expect(page.getByTestId('waitlist-error')).toContainText('too many requests')
    // The refusal names no ceiling and no exact wait, either of which would be
    // free calibration for whoever is tuning the flood.
    await expect(page.getByTestId('waitlist-error')).not.toContainText(/\d/)
    expect(await db.waitlistSignup.findUnique({ where: { email: email('flood-last') } })).toBeNull()
  })
})
