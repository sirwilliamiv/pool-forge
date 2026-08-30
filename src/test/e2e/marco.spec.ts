import { expect, test, type Page } from '@playwright/test'

// Marco: where he appears, what he offers, and what he refuses to cover.

const DEMO_EMAIL = 'demo@poolforge.test'
const DEMO_PASSWORD = 'demo1234'

async function signInAsDemo(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/email/i).fill(DEMO_EMAIL)
  await page.getByLabel(/password/i).fill(DEMO_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 })
}

test.describe('Marco', () => {
  // The docs pages are public and sit inside the signed-in shell, so the
  // middleware lets a stranger through and the layout renders around them.
  // An assistant there can do nothing: every command behind him is org-scoped.
  test('does not appear for a signed-out visitor on a public page', async ({ page }) => {
    await page.goto('/docs/tools')
    await expect(page.getByRole('button', { name: /Talk to Marco/i })).toHaveCount(0)
  })

  test('appears once you are signed in', async ({ page }) => {
    await signInAsDemo(page)
    await expect(page.getByRole('button', { name: /Talk to Marco/i })).toBeVisible({
      timeout: 30_000,
    })
  })

  test('offers what he can do on hover, without being asked', async ({ page }) => {
    await signInAsDemo(page)
    const marco = page.getByRole('button', { name: /Talk to Marco/i })
    await expect(marco).toBeVisible({ timeout: 30_000 })

    // Mounted but faded out, so the reveal can animate. Presence is not the
    // question; whether you can see or press them is.
    // The fade is on the group, not on each pill, so that is what to ask.
    const actions = page.locator('[data-marco-actions]')
    await expect(actions).toHaveCSS('opacity', '0')

    await marco.hover()
    await expect(actions).toHaveCSS('opacity', '1')
    await expect(page.getByRole('button', { name: /Explain this page/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ask me a question/i })).toBeVisible()
  })

  // The bug this exists for: the guide handlers were registered by the editor's
  // own handler component, which only the editor mounts. Everywhere else the
  // agent called guide.point, found no handler, and reported that it was
  // highlighting something while nothing on screen changed.
  test('points at things away from the editor too', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/settings/intake')

    const marco = page.getByRole('button', { name: /Talk to Marco/i })
    await expect(marco).toBeVisible({ timeout: 30_000 })
    await marco.hover()
    await page.getByRole('button', { name: /Explain this page/i }).click()

    // A bare "some ring exists" used to pass here because the TopNav links
    // (Price book, Team, Company) leak through as resolvable dashboard
    // targets on every page. The real claim is that intake.create itself
    // rings, which is the control this page is actually about.
    await expect(page.locator('[data-guide-ring="intake.create"]')).toBeVisible({
      timeout: 10_000,
    })
  })

  // The occlusion rule (resolve.ts's elementFromPoint hit test) is what makes
  // the assertion above meaningful: without it, a covered TopNav link would
  // still count as found. This proves the refusal side of that same rule.
  test('refuses a target the editor covers', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/projects/seed-project-demo/editor')
    const drawing = page.locator('main canvas').first()
    await expect(drawing).toBeVisible({ timeout: 60_000 })

    const unresolved: string[] = await page.evaluate(
      () =>
        (window as unknown as { __pfGuide: { resolve(s: string): string[] } }).__pfGuide.resolve(
          'dashboard',
        ),
    )
    // nav.priceBook is a dashboard target for the TopNav "Price book" link.
    // The editor's own chrome sits over the TopNav here, so the link exists
    // in the DOM but the hit test at its centre lands on something else.
    expect(unresolved).toContain('nav.priceBook')
  })

  test('explaining the page rings real controls, and never the drawing', async ({ page }) => {
    await signInAsDemo(page)
    await page.goto('/projects/seed-project-demo/editor')
    const drawing = page.locator('main canvas').first()
    await expect(drawing).toBeVisible({ timeout: 60_000 })
    await page.waitForTimeout(3000)

    const marco = page.getByRole('button', { name: /Talk to Marco/i })
    await marco.hover()
    await page.getByRole('button', { name: /Explain this page/i }).click()

    const rings = page.locator('[data-guide-ring]')
    await expect(rings.first()).toBeVisible({ timeout: 10_000 })
    expect(await rings.count()).toBeGreaterThan(1)

    // The rule the whole feature is built around: chrome only.
    //
    // Checked by DOM containment, not by geometry. The toolbar floats over a
    // full-bleed canvas, so a ring around a real button sits inside the
    // canvas's rectangle while being nothing to do with the drawing. What must
    // never happen is a ring on an element that lives inside the canvas.
    const offenders = await page.evaluate(() => {
      const bad: string[] = []
      for (const ring of document.querySelectorAll('[data-guide-ring]')) {
        const id = ring.getAttribute('data-guide-ring') ?? ''
        const label = ring.textContent?.trim() ?? ''
        const control = [...document.querySelectorAll('button, a, [role="tab"], select')].find(
          element =>
            (element.getAttribute('aria-label') ?? '').startsWith(label) ||
            (element.getAttribute('title') ?? '').startsWith(label) ||
            (element.textContent ?? '').trim() === label,
        )
        if (control && control.closest('canvas') !== null) bad.push(id)
      }
      return bad
    })
    expect(offenders).toEqual([])
  })
})
