// Scoping decides what the agent can even attempt on a given screen. Getting it
// wrong is not a nicety: an over-broad scope lets a misheard sentence run a
// command against the wrong context, and an under-broad one makes the agent
// useless exactly where it matters.

import { describe, expect, it } from 'vitest'

import { all } from '@/modules/commands/registry'
import { initCommands } from '@/modules/commands/init'
import { scopeFor, screenForPath, VOICE_SCREENS } from '@/modules/voice/scope'

initCommands()

describe('screenForPath', () => {
  it('reads the editor, not the project page, from an editor URL', () => {
    // Most specific first. Matching the shorter prefix would hand the agent the
    // project toolset on the one screen where the editor toolset is the point.
    expect(screenForPath('/projects/abc123/editor')).toBe('editor')
    expect(screenForPath('/projects/abc123/import')).toBe('import')
    expect(screenForPath('/projects/abc123')).toBe('project')
  })

  it('groups the four documents together', () => {
    for (const doc of ['proposal', 'construction', 'site-plan', 'screen-enclosure-quote']) {
      expect(screenForPath(`/projects/abc/${doc}`)).toBe('document')
    }
  })

  it('separates the price book from the rest of settings', () => {
    expect(screenForPath('/settings/price-book')).toBe('priceBook')
    expect(screenForPath('/settings/price-book/import')).toBe('priceBook')
    expect(screenForPath('/settings/company')).toBe('settings')
  })

  it('falls back to the dashboard for anything unrecognised', () => {
    expect(screenForPath('/')).toBe('dashboard')
    expect(screenForPath('/something/else')).toBe('dashboard')
  })
})

describe('scopeFor', () => {
  it('offers navigation on every screen', () => {
    // Being on the wrong screen is the one thing a user should never have to fix
    // before they can ask to go somewhere else.
    for (const screen of VOICE_SCREENS) {
      expect(scopeFor(screen).allows('nav.goto'), `${screen} cannot navigate`).toBe(true)
    }
  })

  it('gives the editor the tools a pool is actually built with', () => {
    const editor = scopeFor('editor')
    expect(editor.allows('add.shape')).toBe(true)
    expect(editor.surface.tools.length).toBeGreaterThan(15)
  })

  it('does not offer editor commands on the dashboard', () => {
    const dashboard = scopeFor('dashboard')
    expect(dashboard.allows('add.shape')).toBe(false)
    expect(dashboard.allows('delete.shape')).toBe(false)
  })

  it('does not offer import commands outside the import screen', () => {
    expect(scopeFor('import').allows('import.intent.apply')).toBe(true)
    expect(scopeFor('editor').allows('import.intent.apply')).toBe(false)
    expect(scopeFor('dashboard').allows('import.intent.apply')).toBe(false)
  })

  it('never allows a command it did not publish', () => {
    // `allows` is what the session re-checks each tool call against, so it has
    // to agree exactly with the surface handed to the model.
    for (const screen of VOICE_SCREENS) {
      const scope = scopeFor(screen)
      for (const tool of scope.surface.tools) {
        expect(scope.allows(tool.name)).toBe(true)
      }
      expect(scope.allows('totally.made.up')).toBe(false)
    }
  })

  it('publishes a usable surface on every screen', () => {
    for (const screen of VOICE_SCREENS) {
      const scope = scopeFor(screen)
      expect(scope.surface.tools.length, `${screen} has no tools`).toBeGreaterThan(0)
    }
  })
})

describe('navigation commands', () => {
  it('resolves a destination to a real path', async () => {
    const { get } = await import('@/modules/commands/registry')
    const goto = get('nav.goto')
    expect(goto).toBeDefined()
    const result = await goto!.execute(
      { destination: 'priceBook' } as never,
      { userId: 'u', orgId: 'o' },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.data as { path: string }).path).toBe('/settings/price-book')
  })

  it('asks which project rather than guessing one', async () => {
    const { get } = await import('@/modules/commands/registry')
    const result = await get('nav.goto')!.execute(
      { destination: 'editor' } as never,
      { userId: 'u', orgId: 'o' },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/belongs to a project/i)
  })

  it('builds project paths from the id it is given', async () => {
    const { get } = await import('@/modules/commands/registry')
    const result = await get('nav.goto')!.execute(
      { destination: 'editor', projectId: 'abc123' } as never,
      { userId: 'u', orgId: 'o' },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.data as { path: string }).path).toBe('/projects/abc123/editor')
  })
})

it('every implemented command with voice examples is reachable from some screen', () => {
  initCommands()
  const reachable = new Set(
    VOICE_SCREENS.flatMap(screen => scopeFor(screen).surface.tools.map(tool => tool.name)),
  )
  const unreachable = all()
    .filter(command => (command.voiceExamples?.length ?? 0) > 0 && !command.unimplemented)
    .map(command => command.id)
    .filter(id => !reachable.has(id))
  expect(unreachable).toEqual([])
})
