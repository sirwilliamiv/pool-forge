import { test } from '@playwright/test'

import { BEAT, chapter, firstProjectHref, login, note, openEditor, say } from './_demo'

const NAME = '07-quote-and-documents'

/** The four documents the app produces, and who each one is for. */
const DOCUMENTS = [
  { label: 'Customer proposal', who: 'The customer. Branded, priced, and signable from a share link.' },
  { label: 'Construction packet', who: 'The crew. Dense measurements on 11x17, everything needed to dig.' },
  { label: 'Site plan', who: 'Permitting. The pool placed on the lot with setbacks.' },
  { label: 'Screen enclosure RFQ', who: 'The cage subcontractor. Panel counts and dimensions to bid from.' },
]

test('Chapter 7 — Quote and documents', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 7',
    'The quote and the documents',
    'Where a drawing turns into money and paper.',
  )

  await openEditor(page)

  await say(
    page,
    'The quote is live',
    'It is not a separate step. Every shape, material and feature you placed is already priced against the price book.',
  )
  const liveQuote = page.locator('text=/LIVE QUOTE/i').first()
  if ((await liveQuote.count()) === 0) {
    note(NAME, 'no LIVE QUOTE panel in the editor')
  } else {
    await liveQuote.click().catch(() => {})
    await page.waitForTimeout(1600)
    await say(page, 'Open it for the line items', 'Every line traces back to a measurement and a price book row.')
  }

  const quoteTab = page.locator('button:has-text("Quote")').first()
  if ((await quoteTab.count()) > 0) {
    await quoteTab.click()
    await page.waitForTimeout(1600)
    await say(page, 'The Quote tab', 'Line items, quantities, rates and tax, with your org sales tax applied.')
  }

  await say(
    page,
    'A quote is reproducible',
    'Each one stores the measurements, the selections and the price book version that produced it, so it can be replayed months later.',
  )
  await page.waitForTimeout(BEAT)

  const href = await firstProjectHref(page)
  await page.goto(href)
  await page.waitForLoadState('networkidle').catch(() => {})

  await say(page, 'Four documents, four audiences', 'The same project, presented for whoever needs it.')
  for (const doc of DOCUMENTS) {
    const link = page.locator(`a:has-text("${doc.label}"), button:has-text("${doc.label}")`).first()
    if ((await link.count()) === 0) {
      note(NAME, `no export entry point for "${doc.label}"`)
      continue
    }
    await say(page, doc.label, doc.who)
    await page.waitForTimeout(500)
  }

  await say(page, 'Open the customer proposal', 'This is the artifact the whole app exists to produce.')
  // A Button that dispatches export.customerProposal, not an anchor.
  const proposal = page
    .locator('a:has-text("Customer proposal"), button:has-text("Customer proposal")')
    .first()
  if ((await proposal.count()) === 0) {
    note(NAME, 'customer proposal link missing on the project page')
  } else {
    await proposal.click()
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2200)
    await say(page, 'Branded and priced', 'Your company details, the design, the line items and the total.')
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(1400)
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(1400)
  }

  await say(page, 'Next: the image import', 'Turning a customer photo or sketch into one of these.')
})
