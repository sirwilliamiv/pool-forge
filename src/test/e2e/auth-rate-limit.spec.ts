// Drives the real sign-in page against the real server and the real counter.
//
// The unit tests prove the counter is exact under concurrency. What they cannot
// prove is that the counter is actually in the path a browser takes, which is
// the failure mode that matters: a limiter wired into a helper nobody calls is
// indistinguishable from no limiter at all.
//
// Each test invents its own client address via `X-Forwarded-For` and takes it
// from the TEST-NET-3 documentation range, so no test can spend another test's
// budget, and nothing here touches the bucket a developer's own browser counts
// under. The rows are deleted afterwards.

import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const DEMO_EMAIL = 'demo@poolforge.test'
const DEMO_PASSWORD = 'demo1234'
const WRONG_PASSWORD = 'not-the-right-password'

/** Distinct documentation addresses, one per test. */
const IP_ATTACKER = '203.0.113.11'
const IP_COLLEAGUE = '203.0.113.22'
const IP_STRANGER = '203.0.113.33'
const IP_UNRELATED = '203.0.113.44'
const IP_SIGNUP = '203.0.113.77'

const THROTTLED = /too many sign-in attempts/i
const INVALID = /invalid email or password/i

// Not serial: each test invents its own address, so no test can spend another
// test's budget and one failure must not hide the others.
test.describe.configure({ timeout: 180_000 })

async function attempt(page: Page, email: string, password: string): Promise<string> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Either an error paragraph appears, or the sign-in succeeded and we leave.
  await Promise.race([
    page.locator('p.text-destructive').first().waitFor({ state: 'visible', timeout: 60_000 }),
    page.waitForURL(/\/dashboard/, { timeout: 60_000 }),
  ])
  if (/\/dashboard/.test(page.url())) return 'SIGNED_IN'
  return (await page.locator('p.text-destructive').first().innerText()).trim()
}

/** Documentation-range keys are this file's alone: clear them at both ends so a
 *  rerun inside the same window starts from a known state. */
async function clearTestBuckets(): Promise<void> {
  await db.$executeRawUnsafe(`DELETE FROM "RateLimitCounter" WHERE "key" LIKE '%203.0.113.%'`)
}

test.beforeAll(async () => {
  await clearTestBuckets()
})

test.afterAll(async () => {
  await clearTestBuckets()
  await db.$disconnect()
})

test.describe('one address guessing one account', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': IP_ATTACKER } })

  test('runs out of attempts, and the correct password no longer helps', async ({ page }) => {
    const seen: string[] = []
    for (let i = 0; i < 5; i += 1) {
      seen.push(await attempt(page, DEMO_EMAIL, WRONG_PASSWORD))
    }

    // The early failures say only that the credentials were wrong.
    expect(seen[0]).toMatch(INVALID)
    expect(seen[1]).toMatch(INVALID)
    expect(seen[2]).toMatch(INVALID)
    // By the time the budget is spent the page stops inviting more guessing.
    expect(seen[seen.length - 1]).toMatch(THROTTLED)

    // The proof that this is the limiter and not the password check: the RIGHT
    // password is now refused too, and no session is issued.
    const withCorrectPassword = await attempt(page, DEMO_EMAIL, DEMO_PASSWORD)
    expect(withCorrectPassword).toMatch(THROTTLED)
    expect(page.url()).toContain('/login')
    const cookies = await page.context().cookies()
    expect(cookies.some((c) => c.name.includes('authjs.session-token'))).toBe(false)

    await page.screenshot({ path: 'test-results/login-rate-limited.png', fullPage: true })
  })

  test('the refusal names no ceiling, no countdown, and no account', async ({ page }) => {
    const message = await attempt(page, DEMO_EMAIL, WRONG_PASSWORD)
    expect(message).toMatch(THROTTLED)
    // Nothing an attacker can use to calibrate: no remaining count, no seconds,
    // no window length, no mention of locking or of the account existing.
    expect(message).not.toMatch(/\d/)
    expect(message).not.toMatch(/lock|disabled|suspend|exist|registered|found/i)
  })
})

test.describe('an unrelated builder at another address', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': IP_COLLEAGUE } })

  test('signs in normally while the other address is still shut out', async ({ page }) => {
    // Same account, same moment, different address. A limiter keyed only on the
    // email would have locked this person out of their own business because
    // somebody else was guessing at them.
    expect(await attempt(page, DEMO_EMAIL, DEMO_PASSWORD)).toBe('SIGNED_IN')
  })
})

test('an address with no account is throttled exactly like a real one', async ({ browser }) => {
  // The oracle this test exists to rule out: if throttling arrived sooner, later,
  // or with different wording for an address that has an account, the sign-in
  // page would answer "is this person a customer" to anyone who asked five
  // times. Two clients, two addresses, same script, and the two transcripts have
  // to be identical.
  //
  // Separate addresses matter. The per-(address, account) bucket means two
  // different emails from ONE address always have separate budgets, so running
  // both scripts from one client would compare nothing.
  async function transcript(ip: string, email: string): Promise<string[]> {
    const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': ip } })
    const page = await context.newPage()
    const lines: string[] = []
    try {
      for (let i = 0; i < 6; i += 1) lines.push(await attempt(page, email, WRONG_PASSWORD))
    } finally {
      await context.close()
    }
    return lines
  }

  const noSuchAccount = await transcript(IP_STRANGER, `nobody-${Date.now()}@example.test`)
  const realAccount = await transcript(IP_UNRELATED, DEMO_EMAIL)

  expect(noSuchAccount).toEqual(realAccount)
  // And the transcript is the one we expect: guessing, then throttled, with the
  // switch in the same place for both.
  expect(noSuchAccount.filter((line) => THROTTLED.test(line)).length).toBeGreaterThan(0)
  expect(noSuchAccount[0]).toMatch(INVALID)
})

test.describe('signing up', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': IP_SIGNUP } })

  test('is not a thing that exists any more', async ({ page }) => {
    // This used to spend a per-address ceiling on account creation. There is no
    // account creation to throttle: Pool Forge is invite only, `registerAction`
    // creates nothing whatever it is handed, and the only door is an invite link.
    //
    // A ceiling is still needed on the doors that DID open, reset requests and
    // link redemption, and those are covered in `invites.spec.ts` and the
    // rate-limit unit suite. What is left here is the one assertion that still
    // means something at this address: however this page is answered, no session
    // comes out of it.
    await page.goto('/register')
    await page.waitForLoadState('domcontentloaded')
    expect(page.url()).not.toContain('/dashboard')
    const cookies = await page.context().cookies()
    expect(cookies.some((c) => c.name.includes('authjs.session-token'))).toBe(false)
  })
})
