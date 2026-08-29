// Does every command actually do something?
//
// This is the defect this codebase produces most reliably: a command that is
// registered, offered to the voice agent, reports success, and changes nothing.
// It has shipped a dozen times — zoom, pan, fit to page, two navigation
// commands, delete, project creation, the pool trim — and every single one was
// found by a person using the app and being told something happened that had
// not. The unit suite was green through all of them, because each half worked:
// the command was registered and the server returned ok.
//
// So this test looks at the seam instead. It is static on purpose: it reads the
// handler files rather than rendering them, because the failure is a missing
// registration, and a test that had to mount the editor to notice would be too
// slow to run on every change.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { initCommands } from '@/modules/commands/init'
import { all } from '@/modules/commands/registry'
import { buildToolSurface } from '@/modules/voice/tools'

initCommands()

const HANDLER_FILES = [
  'src/components/editor/ClientCommandHandlers.tsx',
  'src/components/voice/VoiceDock.tsx',
  'src/components/exports/ExportCommandHandlers.tsx',
]

/** Ids passed to `registerClientHandler`, however the call is formatted. */
function registeredHandlerIds(): Set<string> {
  const found = new Set<string>()
  for (const file of HANDLER_FILES) {
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    // The call spans lines and its type arguments can run to several hundred
    // characters, so the window is generous: too small and the biggest handlers
    // are missed, which is the one way this test could pass while being wrong.
    for (const match of source.matchAll(/registerClientHandler[\s\S]{0,800}?\(\s*'([^']+)'/g)) {
      if (match[1]) found.add(match[1])
    }
  }
  return found
}

describe('command wiring', () => {
  const handlers = registeredHandlerIds()

  it('finds the handler registrations at all', () => {
    // Guards the guard: if the regex stopped matching, every assertion below
    // would pass vacuously and the whole test would be worthless.
    expect(handlers.size).toBeGreaterThan(30)
  })

  it('every client-side command has a handler', () => {
    // The exact failure, caught before a user is told a lie.
    const missing = all()
      .filter(command => command.runsOn === 'client' && !command.unimplemented)
      .map(command => command.id)
      .filter(id => !handlers.has(id))

    expect(missing, `these claim success and do nothing: ${missing.join(', ')}`).toEqual([])
  })

  it('every handler belongs to a command that exists', () => {
    // The other direction: a handler for a renamed or deleted command is dead
    // code that silently stops running.
    const ids = new Set(all().map(command => command.id))
    const orphans = [...handlers].filter(id => !ids.has(id))
    expect(orphans, `handlers for commands that do not exist: ${orphans.join(', ')}`).toEqual([])
  })

  it('a command with a handler says it runs on the client', () => {
    // Keeps the declaration honest in the other direction, so `runsOn` can be
    // trusted by anything else that reads it.
    const undeclared = all()
      .filter(command => handlers.has(command.id) && command.runsOn !== 'client')
      .map(command => command.id)
    expect(undeclared, `these have handlers but are not marked client-side: ${undeclared.join(', ')}`).toEqual([])
  })

  it('nothing the voice agent is offered is a stub', () => {
    // Against the surface actually handed to the model, not against which
    // commands happen to carry voice examples: a stub with examples is fine
    // precisely because the converter refuses to publish it.
    const categories = [...new Set(all().map(command => command.category))]
    const { tools } = buildToolSurface(categories)
    const published = new Set(tools.map(tool => tool.name))
    const stubs = all()
      .filter(command => command.unimplemented && published.has(command.id))
      .map(command => command.id)
    expect(stubs).toEqual([])
  })

  it('nothing the voice agent is offered is client-side without a handler', () => {
    // The two failures composed: a tool the model can call, that reports
    // success, and does nothing. Every instance of this shipped.
    const categories = [...new Set(all().map(command => command.category))]
    const { tools } = buildToolSurface(categories)
    const broken = tools
      .map(tool => all().find(command => command.id === tool.name))
      .filter(command => command?.runsOn === 'client' && !handlers.has(command.id))
      .map(command => command!.id)
    expect(broken).toEqual([])
  })

  it('every command has a description worth reading', () => {
    for (const command of all()) {
      expect(command.description.length, command.id).toBeGreaterThan(15)
      expect(command.label.length, command.id).toBeGreaterThan(2)
    }
  })
})
