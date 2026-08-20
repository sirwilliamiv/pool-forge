import { existsSync } from 'node:fs'

import { test } from '@playwright/test'

import { BEAT, chapter, login, note, say } from './_demo'

const NAME = '08-image-import'
const SKETCH = '/Users/b/Downloads/IMG_1093.HEIC'

test('Chapter 8 — Image import', async ({ page }) => {
  await login(page)
  await chapter(
    page,
    'Chapter 8',
    'From a photo to a measured design',
    'A customer texts you a sketch. This turns it into a project.',
  )

  await say(
    page,
    'Customer uploads',
    'You send a link. The homeowner drops photos in from their phone, and the submission lands as a draft project.',
  )
  await page.goto('/settings/intake')
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Five kinds of image, handled differently',
    'A dimensioned sketch gives geometry. A ChatGPT render gives intent and is never trusted for dimensions. A plat gives setbacks.',
  )

  await page.goto('/dashboard')
  const project = page.locator('a[href*="/projects/"]').first()
  const href = await project.getAttribute('href')
  if (!href) {
    note(NAME, 'no project to import into')
    return
  }

  await page.goto(`${href}/import`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await say(page, 'The import screen', 'The image on the left, everything read out of it on the right.')
  await page.waitForTimeout(BEAT)

  if (!existsSync(SKETCH)) {
    note(NAME, `sample sketch not found at ${SKETCH}, recorded the screen without an upload`)
  } else {
    // The upload control only renders while an import has no images yet, so a
    // session that already holds one shows the review screen instead. Start a
    // fresh import rather than reporting a missing input that is simply not
    // part of this state.
    const startFresh = page.locator('button:has-text("Start an import"), a:has-text("Start an import")').first()
    if ((await startFresh.count()) > 0) {
      await startFresh.click().catch(() => {})
      await page.waitForTimeout(2500)
    }
    const input = page.locator('input[type="file"]').first()
    if ((await input.count()) === 0) {
      note(NAME, 'no file input even on a fresh import, so the upload state was not reachable')
    } else {
      await say(page, 'Upload the photo', 'iPhone HEIC is decoded server side, and location data is stripped before anything is stored.')
      await input.setInputFiles(SKETCH)
      await page.waitForTimeout(6000)
    }
  }

  await say(
    page,
    'Three stages',
    'Classify what kind of image it is, extract what is drawn, then resolve the scale.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'The model reads, the code measures',
    'It recognises the pool, the spa and the materials. Every number comes from deterministic code, because a model that is bad at arithmetic must never price a job.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Two things it refuses to do',
    'It will not apply geometry without a scale, and it will not apply a field it was unsure about until you have looked at it.',
  )
  const banner = page.locator('text=/no scale/i').first()
  if ((await banner.count()) > 0) {
    await say(page, 'No scale, no geometry', 'Nothing on the page said how big anything is, so it asks rather than inventing a number.')
  }

  await say(
    page,
    'Calibrate with two points',
    'Click two points you know the real distance between. Every dimension follows from that.',
  )
  await page.waitForTimeout(BEAT)

  await say(
    page,
    'Then apply',
    'The pool, its features and its materials land in the editor as real shapes, priced against your price book.',
  )
})
