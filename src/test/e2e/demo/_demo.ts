// Shared machinery for the recorded chapters.
//
// The captions are the point. A silent click-through shows what happens but not
// why, and the reason this exists is that the app has 72 stencils, 59 commands,
// and 33 hotkeys with no way to discover them. Every chapter narrates itself.

import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

// The seeded demo organisation, which is the one with a price book in it.
//
// These recordings used to sign in as demo@poolforge.local, whose organisation
// has no price book at all, so every chapter filmed a LIVE QUOTE reading "Not
// priced" and no document ever carried a number. The demo of an estimating tool
// has to show estimates.
export const DEMO_EMAIL = 'demo@poolforge.test'
export const DEMO_PASSWORD = 'demo1234'

/** Long enough to read a caption, short enough not to drag. */
export const BEAT = 1400

const CAPTION_ID = 'pf-demo-caption'

/**
 * When each caption went up, so a voice track can be laid over the recording.
 *
 * Written beside the video, in the same directory Playwright puts it, because
 * the two only mean anything together. Timed from the first thing the chapter
 * does rather than from the first caption: the video starts recording when the
 * browser context opens, which is the same moment.
 */
const chapterStart = new Map<string, number>()

function markChapterStart(): void {
  const id = test.info().testId
  if (!chapterStart.has(id)) chapterStart.set(id, Date.now())
}

/**
 * How long each caption takes to read aloud, in milliseconds.
 *
 * These chapters were paced for reading, and speech is slower, so laying a
 * voice over a finished recording meant squeezing most lines and talking over
 * the next one anyway. The recording waits for the speech instead. Missing
 * entries just fall back to the normal beat, so a new caption is never blocked
 * on regenerating this file.
 *
 * Regenerate with `node scripts/narrate-demo.mjs measure` after changing caption text.
 */
const NARRATION: Record<string, number> = (() => {
  const path = join(process.cwd(), 'src/test/e2e/demo/narration-timing.json')
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
})()

/** The same key the measuring script writes: the spoken sentence, hashed. */
export function narrationKey(title: string, detail: string): string {
  const text = detail ? `${title}. ${detail}` : title
  return createHash('sha1').update(text).digest('hex').slice(0, 16)
}

/** Long enough to say the line out loud, and never shorter than a beat. */
function holdFor(title: string, detail: string): number {
  const spoken = NARRATION[narrationKey(title, detail)]
  return spoken === undefined ? BEAT : Math.max(BEAT, spoken + 400)
}

function logCaption(title: string, detail: string): void {
  const info = test.info()
  const started = chapterStart.get(info.testId)
  if (started === undefined) return
  appendFileSync(
    info.outputPath('captions.jsonl'),
    JSON.stringify({ atMs: Date.now() - started, title, detail }) + '\n',
  )
}

/**
 * Draw a caption over the page.
 *
 * Re-injected on every call because a navigation wipes it, and chapters cross
 * routes constantly.
 */
export async function say(page: Page, title: string, detail = ''): Promise<void> {
  logCaption(title, detail)
  await page.evaluate(
    ({ id, title, detail }) => {
      let el = document.getElementById(id)
      if (!el) {
        el = document.createElement('div')
        el.id = id
        el.style.cssText = [
          'position:fixed',
          'left:50%',
          'bottom:38px',
          'transform:translateX(-50%)',
          'z-index:2147483647',
          'max-width:min(1100px,86vw)',
          'padding:14px 22px',
          'border-radius:14px',
          'background:rgba(11,18,32,0.93)',
          'color:#fff',
          'font:500 17px/1.45 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif',
          'box-shadow:0 12px 40px rgba(0,0,0,0.34)',
          'pointer-events:none',
          'text-align:center',
          'backdrop-filter:blur(6px)',
        ].join(';')
        document.body.appendChild(el)
      }
      // Built as nodes with textContent rather than innerHTML: captions
      // interpolate project names and extracted values straight from the
      // database, so markup in a customer name must never become markup here.
      el.textContent = ''
      const head = document.createElement('div')
      head.style.cssText = 'font-weight:650;letter-spacing:0.01em'
      head.textContent = title
      el.appendChild(head)
      if (detail) {
        const sub = document.createElement('div')
        sub.style.cssText = 'opacity:0.82;font-weight:400;font-size:15px;margin-top:4px'
        sub.textContent = detail
        el.appendChild(sub)
      }
    },
    { id: CAPTION_ID, title, detail },
  )
  await page.waitForTimeout(holdFor(title, detail))
}

/** A chapter title card, held long enough to read before the action starts. */
export async function chapter(page: Page, n: string, title: string, detail: string): Promise<void> {
  await say(page, `${n} · ${title}`, detail)
  await page.waitForTimeout(900)
}

export async function login(page: Page): Promise<void> {
  markChapterStart()
  await page.goto('/login')
  await page.fill('input[name="email"]', DEMO_EMAIL)
  await page.fill('input[name="password"]', DEMO_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 60_000 })
}

/**
 * Open the newest project's editor and wait for the 3D scene to be live.
 *
 * Waiting on the canvas rather than a timeout: the scene mounts asynchronously
 * and a fixed sleep either wastes video or films a blank viewport.
 */
export async function openEditor(page: Page, projectHref?: string): Promise<string> {
  const href = projectHref ?? (await firstProjectHref(page))
  await page.goto(`${href}/editor`)

  // Retry once with a reload. The editor is a heavy 3D route and its very
  // first compile in dev can outrun any reasonable wait; every visit after
  // that is cached. Failing the whole chapter over a cold compile would make
  // the recordings look broken when the product is not.
  try {
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 })
  } catch {
    await page.reload()
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 90_000 })
  }
  await page.waitForTimeout(2500)
  return href
}

/**
 * Compile the editor route once before any chapter records against it, so no
 * recording opens with a blank viewport waiting on a dev-mode build.
 */
export async function warmEditorRoute(page: Page): Promise<void> {
  const href = await firstProjectHref(page)
  await page.goto(`${href}/editor`)
  await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 180_000 }).catch(() => {})
}

/**
 * Close anything modal before navigating or clicking elsewhere.
 *
 * Two chapters burned their entire ten-minute budget waiting on a click that a
 * left-open dialog was intercepting. A stuck overlay looks exactly like a hung
 * app from inside the runner, so chapters clear it explicitly rather than
 * hoping the previous step tidied up.
 */
export async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const close = page.locator('button:has-text("Close"), [aria-label="Close"]').first()
    if ((await close.count()) > 0 && (await close.isVisible().catch(() => false))) {
      await close.click({ timeout: 4000 }).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(280)
  }
}

export async function firstProjectHref(page: Page): Promise<string> {
  await page.goto('/dashboard')
  const href = await page.locator('a[href*="/projects/"]').first().getAttribute('href')
  if (!href) throw new Error('no project on the dashboard to open')
  return href
}

/**
 * Click a toolbar tool by its accessible label and let the mode settle.
 * Labels come from the toolbar's `aria-label`, so this breaks loudly if one is
 * renamed rather than silently clicking nothing.
 */
export async function tool(page: Page, label: string): Promise<void> {
  await page.click(`[aria-label="${label}"]`)
  await page.waitForTimeout(600)
}

/**
 * Choose a pool family from the toolbar picker.
 *
 * The trigger opens a Radix dropdown whose entries are `[role="menuitem"]`,
 * not buttons, and only selecting one sets `activeTool`. Clicking the trigger
 * alone leaves the tool inactive, so a later canvas click places nothing and
 * the chapter records a pool that never appears.
 */
export async function pickPoolShape(page: Page, family = 'Rectangle'): Promise<boolean> {
  const trigger = page.locator('[aria-label="Pool shape"]').first()
  if ((await trigger.count()) === 0) return false
  await trigger.click()
  await page.waitForTimeout(700)
  const item = page.locator(`[role="menuitem"]:has-text("${family}")`).first()
  if ((await item.count()) === 0) {
    await page.keyboard.press('Escape')
    return false
  }
  await item.click()
  await page.waitForTimeout(700)
  return (await trigger.getAttribute('aria-pressed')) === 'true'
}

/** Centre of the canvas, for drag gestures. */
export async function canvasBox(page: Page) {
  const box = await page.locator('canvas').first().boundingBox()
  if (!box) throw new Error('canvas has no box')
  return box
}

/** Drag on the canvas, in fractions of the canvas box, so it is resolution independent. */
export async function dragOnCanvas(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const box = await canvasBox(page)
  await page.mouse.move(box.x + box.width * from.x, box.y + box.height * from.y)
  await page.mouse.down()
  // Intermediate moves: a single jump can be dropped by pointer handlers that
  // expect a stream, and it looks wrong on video.
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      box.x + box.width * (from.x + ((to.x - from.x) * i) / 12),
      box.y + box.height * (from.y + ((to.y - from.y) * i) / 12),
    )
    await page.waitForTimeout(24)
  }
  await page.mouse.up()
  await page.waitForTimeout(700)
}

export async function clickOnCanvas(page: Page, at: { x: number; y: number }): Promise<void> {
  const box = await canvasBox(page)
  await page.mouse.click(box.x + box.width * at.x, box.y + box.height * at.y)
  await page.waitForTimeout(600)
}

/**
 * Record what a chapter found broken without failing the recording.
 *
 * The brief for these demos is to note defects and keep filming rather than
 * stop and fix, so an honest picture of the product survives the run.
 */

/**
 * A project of this chapter's own, empty, named per run.
 *
 * Chapters that teach "place your first object" cannot open whatever was worked
 * on last: a seeded database hands them a finished design with nine objects on
 * it. A fixed name is no good either, because the second recording then opens
 * the first recording's project with its pool still in it.
 */
export async function newProject(page: Page, label: string): Promise<string> {
  const name = `${label} ${Date.now().toString(36).slice(-4)}`
  await page.goto('/dashboard')
  await page.getByRole('button', { name: /new project/i }).first().click()
  await page.locator('input').first().fill(name)
  await page.getByRole('button', { name: /^create/i }).click()
  await page.getByText(name).first().waitFor({ timeout: 60_000 })
  await page.getByText(name).first().click()
  await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 60_000 })
  const href = new URL(page.url()).pathname
  await openEditor(page, href)
  return href
}

/**
 * Square feet currently on the drawing, read off the inspector.
 *
 * Not the layer count: that lives in the Layers panel and is off screen
 * whenever Stencils or Materials is open, which is exactly when a chapter
 * wants to check that a click placed something. A chapter that narrates
 * deleting a pool over an empty canvas is worse than no chapter.
 */
export async function surfaceSqft(page: Page): Promise<number> {
  const text = await page.evaluate(() => document.body.innerText)
  const m = text.match(/SURFACE AREA\s*([\d,]+)/i)
  return m?.[1] ? Number(m[1].replace(/,/g, '')) : -1
}

export const findings: string[] = []

export function note(chapterName: string, what: string): void {
  const line = `[${chapterName}] ${what}`
  findings.push(line)
  console.log('FINDING ' + line)
}
