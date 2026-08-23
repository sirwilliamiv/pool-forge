import { chromium } from '@playwright/test'
const SHOTS = '/private/tmp/claude-501/-Users-b-Desktop-code-Pool-forge/e530436b-b2d3-4c32-a5fa-62ad823dc4fc/scratchpad/shots'
const BASE = 'http://localhost:3001'
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 300)))
page.on('response', async r => {
  if (r.url().includes('/api/commands')) {
    let body = ''
    try { body = (await r.text()).slice(0, 300) } catch {}
    console.log('[api]', r.status(), body)
  }
})
await page.goto(BASE + '/login')
await page.locator('#email').fill('demo@poolforge.test')
await page.locator('#password').fill('demo1234')
await page.getByRole('button', { name: /sign in/i }).click()
await page.waitForURL(/dashboard/, { timeout: 120000 })
const run = Math.random().toString(36).slice(2, 7)
await page.getByRole('button', { name: /new project/i }).first().click()
await page.locator('input').first().fill('UX ' + run)
await page.getByRole('button', { name: /^create/i }).click()
await page.getByText('UX ' + run).first().waitFor({ timeout: 120000 })
await page.getByText('UX ' + run).first().click()
await page.waitForURL(/\/projects\/[a-z0-9]+/i, { timeout: 120000 })
const projectUrl = new URL(page.url()).pathname
console.log('project', projectUrl)
await page.goto(BASE + projectUrl + '/editor')
await page.waitForLoadState('networkidle', { timeout: 180000 }).catch(()=>{})
await page.waitForTimeout(8000)
await page.screenshot({ path: SHOTS + '/01-editor.png' })
await page.keyboard.press('Meta+k')
await page.waitForTimeout(1500)
await page.screenshot({ path: SHOTS + '/02-palette.png' })
console.log('--- clicking Add a waterfall ---')
await page.getByText('Add a waterfall', { exact: true }).click()
await page.waitForTimeout(3000)
await page.screenshot({ path: SHOTS + '/03-after-waterfall.png' })
console.log('--- clicking Add 2 LED lights ---')
await page.keyboard.press('Meta+k')
await page.waitForTimeout(1000)
await page.getByText('Add 2 LED lights', { exact: true }).click()
await page.waitForTimeout(3000)
await page.screenshot({ path: SHOTS + '/04-after-led.png' })
console.log('--- clicking a suggestion ---')
await page.keyboard.press('Meta+k')
await page.waitForTimeout(1000)
const sug = page.getByText(/sun study/i).first()
if (await sug.count()) { await sug.click() } else { console.log('no sun study row') }
await page.waitForTimeout(3000)
await page.screenshot({ path: SHOTS + '/05-after-suggestion.png' })
console.log('URL', page.url())
await b.close()
