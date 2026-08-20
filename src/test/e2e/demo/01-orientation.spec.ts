import { test } from '@playwright/test'

import { BEAT, chapter, login, note, say } from './_demo'

const NAME = '01-orientation'

test('Chapter 1 — Orientation', async ({ page }) => {
  await page.goto('/login')
  await chapter(
    page,
    'Chapter 1',
    'Orientation',
    'What Pool Forge is, and how a job moves through it.',
  )

  await say(
    page,
    'Sign in',
    'One organisation per builder. Every query in the app is scoped to it, so you never see another company data.',
  )
  await login(page)

  await say(
    page,
    'The dashboard is your pipeline',
    'Every project sits in a stage, and the stage is what the rest of the app keys off.',
  )
  await page.waitForTimeout(BEAT)

  for (const status of ['Draft', 'Ready for review', 'Proposal sent', 'Approved']) {
    const link = page.locator(`a:has-text("${status}")`).first()
    if ((await link.count()) === 0) {
      note(NAME, `dashboard has no filter link for status "${status}"`)
      continue
    }
    await say(page, `Stage: ${status}`, 'Filters the pipeline to just this stage.')
    await link.click()
    await page.waitForTimeout(900)
  }

  await page.goto('/dashboard')
  await say(
    page,
    'The whole job lives in one project',
    'The drawing, the measurements, the price book selections, the quote, and every document come from a single record.',
  )

  await say(
    page,
    'Four places to work',
    'Dashboard for the pipeline, Price book for what things cost, Customer uploads for photos and sketches, Company for your branding.',
  )
  for (const nav of ['Price book', 'Customer uploads', 'Company']) {
    const link = page.locator(`a:has-text("${nav}")`).first()
    if ((await link.count()) === 0) {
      note(NAME, `top nav is missing "${nav}"`)
      continue
    }
    await link.click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await say(page, nav, '')
  }

  await page.goto('/dashboard')
  await say(
    page,
    'Next: the price book',
    'Nothing can be quoted until the app knows what you charge, so that comes first.',
  )
})
