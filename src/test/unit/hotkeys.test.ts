/** @vitest-environment jsdom */

// Keyboard shortcuts, and whether they are real.
//
// The table existed and nothing imported it, so every shortcut in the product
// did nothing: no undo, no delete, no view switch, no tool. Six entries also
// named commands that were never registered, so wiring the table as written
// would have left Cmd+Z dispatching "history.undo" into nowhere. That is the
// one shortcut everybody reaches for, and losing a pool to a misclick was
// permanent because of it.

import { describe, expect, it } from 'vitest'

import { initCommands } from '@/modules/commands/init'
import { all } from '@/modules/commands/registry'
import { HOTKEYS } from '@/modules/editor/hotkeys'
import { shortcutFor } from '@/modules/editor/hotkeys/useHotkeys'

initCommands()

const registered = new Set(all().map(command => command.id))

function press(init: Partial<KeyboardEventInit> & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('the shortcut table', () => {
  it('found both lists', () => {
    // Guards the guard: an empty import would make every assertion below pass
    // while checking nothing.
    expect(HOTKEYS.length).toBeGreaterThan(10)
    expect(registered.size).toBeGreaterThan(50)
  })

  it('only names commands that exist', () => {
    const ghosts = HOTKEYS.filter(entry => !registered.has(entry.commandId)).map(
      entry => `${entry.shortcut} -> ${entry.commandId}`,
    )
    expect(ghosts, `shortcuts pointing at nothing: ${ghosts.join(', ')}`).toEqual([])
  })

  it('binds undo and redo, which is the pair that has to work', () => {
    const undo = HOTKEYS.find(entry => entry.shortcut === 'mod+z')
    expect(undo?.commandId).toBe('edit.undo')
    expect(HOTKEYS.find(entry => entry.shortcut === 'mod+shift+z')?.commandId).toBe('edit.redo')
  })

  it('never binds one shortcut to two different commands', () => {
    // The second would be unreachable and its tooltip would advertise a key
    // that does something else.
    const byShortcut = new Map<string, Set<string>>()
    for (const entry of HOTKEYS) {
      const seen = byShortcut.get(entry.shortcut) ?? new Set<string>()
      seen.add(entry.commandId)
      byShortcut.set(entry.shortcut, seen)
    }
    const clashes = [...byShortcut.entries()]
      .filter(([, commands]) => commands.size > 1)
      .map(([shortcut, commands]) => `${shortcut}: ${[...commands].join(' and ')}`)
    expect(clashes).toEqual([])
  })
})

describe('reading a keystroke', () => {
  it('spells a plain key the way the table does', () => {
    expect(shortcutFor(press({ key: 'v' }))).toBe('v')
    expect(shortcutFor(press({ key: 'V', shiftKey: true }))).toBe('shift+v')
  })

  it('treats Cmd and Ctrl as the same modifier', () => {
    // One entry covers both platforms, which is the whole point of spelling it
    // "mod": two entries would drift.
    expect(shortcutFor(press({ key: 'z', metaKey: true }))).toBe('mod+z')
    expect(shortcutFor(press({ key: 'z', ctrlKey: true }))).toBe('mod+z')
  })

  it('puts the modifiers in the order the table uses', () => {
    // A lookup is only as good as both sides agreeing how to spell it.
    expect(shortcutFor(press({ key: 'z', metaKey: true, shiftKey: true }))).toBe('mod+shift+z')
  })

  it('names the keys that have no character', () => {
    expect(shortcutFor(press({ key: 'Escape' }))).toBe('escape')
    expect(shortcutFor(press({ key: 'Delete' }))).toBe('delete')
    expect(shortcutFor(press({ key: 'Backspace' }))).toBe('backspace')
    expect(shortcutFor(press({ key: ' ' }))).toBe('space')
  })

  it('produces a spelling the table can actually find', () => {
    // The pair of tests above can both be right while still not matching, so
    // this one closes the loop on the shortcut that matters most.
    const spelling = shortcutFor(press({ key: 'z', metaKey: true }))
    expect(HOTKEYS.some(entry => entry.shortcut === spelling)).toBe(true)
  })
})
