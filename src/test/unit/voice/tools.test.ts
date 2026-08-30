// The tool surface is generated from the command registry, so these tests are
// really about one thing: a command that cannot be described honestly must be
// refused rather than published in a shape Gemini will silently mangle.

import { describe, expect, it } from 'vitest'

import { initCommands } from '@/modules/commands/init'
import { all, type CommandCategory } from '@/modules/commands/registry'
import { DESTRUCTIVE, buildToolSurface, describable, isDestructive } from '@/modules/voice/tools'

initCommands()

const EVERY_CATEGORY: CommandCategory[] = [
  'project',
  'canvas',
  'shape',
  'measurement',
  'pricing',
  'validation',
  'export',
  'template',
  'auth',
  'settings',
  'scene',
  'palette',
  'import',
]

describe('voice tool surface', () => {
  it('covers the overwhelming majority of the registry', () => {
    const { tools, refused } = buildToolSurface(EVERY_CATEGORY)
    expect(tools.length).toBeGreaterThan(40)
    // Every command is accounted for: published or refused with a stated reason.
    const registered = all().filter(c => EVERY_CATEGORY.includes(c.category)).length
    expect(tools.length + refused.length).toBe(registered)
    for (const entry of refused) expect(entry.reason).toBeTruthy()
  })

  it('gives every refusal a reason a human can act on', () => {
    const { refused } = buildToolSurface(EVERY_CATEGORY)
    for (const entry of refused) {
      expect(entry.reason.length, `${entry.name} refused without explanation`).toBeGreaterThan(10)
    }
  })

  it('never publishes a command that cannot run', () => {
    // A tool whose execute returns "not implemented" is worse than a missing
    // one: the model keeps trying it, apologises, and tries again.
    const { tools } = buildToolSurface(EVERY_CATEGORY)
    const published = new Set(tools.map(tool => tool.name))
    for (const command of all()) {
      if (command.unimplemented) {
        expect(published.has(command.id), `${command.id} is a stub but is offered by voice`).toBe(false)
      }
    }
  })

  it('scopes to the categories asked for and nothing else', () => {
    const { tools } = buildToolSurface(['pricing'])
    expect(tools.length).toBeGreaterThan(0)
    const pricingIds = new Set(all().filter(c => c.category === 'pricing').map(c => c.id))
    for (const tool of tools) expect(pricingIds.has(tool.name)).toBe(true)
  })

  it('puts the voice examples in the description, which is the useful signal', () => {
    const { tools } = buildToolSurface(['project'])
    const create = tools.find(t => t.name === 'create.project')
    expect(create).toBeDefined()
    expect(create?.description).toMatch(/Say things like/)
  })

  it('emits object-typed parameters, as the Live API requires', () => {
    const { tools } = buildToolSurface(EVERY_CATEGORY)
    for (const tool of tools) {
      expect(tool.parameters.type, `${tool.name} must take an object`).toBe('object')
      expect(typeof tool.parameters.properties).toBe('object')
    }
  })

  it('never publishes anyOf, oneOf, allOf or $ref', () => {
    // The whole point: these are the shapes that become {} with no error, so a
    // model would call the command with a missing argument and nothing would say
    // so. Serialising the surface is the bluntest way to prove none survive.
    const { tools } = buildToolSurface(EVERY_CATEGORY)
    const serialised = JSON.stringify(tools)
    for (const forbidden of ['"anyOf"', '"oneOf"', '"allOf"', '"$ref"', '"not"']) {
      expect(serialised, `${forbidden} reached the published surface`).not.toContain(forbidden)
    }
  })

  it('treats a nullable argument as simply optional', () => {
    // `.nullable()` is this codebase's convention, and Zod renders it as
    // anyOf: [T, null]. Refusing every command carrying one would gut the
    // surface for a shape that is perfectly expressible.
    const { tools, refused } = buildToolSurface(['template'])
    const setDefault = tools.find(t => t.name === 'template.scene.setDefault')
    expect(
      setDefault,
      `nullable argument was refused: ${refused.map(r => r.reason).join('; ')}`,
    ).toBeDefined()
    expect(setDefault?.parameters.properties['templateId']).toMatchObject({ type: 'string' })
  })

  it('excludes commands with no spoken form rather than inventing one', () => {
    const { refused } = buildToolSurface(EVERY_CATEGORY)
    const silent = refused.filter(r => /no voice examples/.test(r.reason))
    for (const entry of silent) {
      const command = all().find(c => c.id === entry.name)
      expect(command?.voiceExamples ?? []).toHaveLength(0)
    }
  })

  it('flags the commands that must be confirmed before running', () => {
    // Voice misrecognition plus a destructive command is how a drawing is lost.
    expect(isDestructive('template.scene.apply')).toBe(true)
    expect(isDestructive('import.intent.apply')).toBe(true)
    expect(isDestructive('project.delete')).toBe(true)
    expect(isDestructive('set.pool.length')).toBe(false)
  })

  it('gates a click on a button whose words mean something is lost', () => {
    // page.click presses whatever a page renders, so the id says nothing about
    // what it does. The label is the only signal there is, and without this a
    // model wrote its own confirm: true and deleted a project on one sentence.
    expect(isDestructive('page.click', { label: 'Delete project' })).toBe(true)
    expect(isDestructive('page.click', { label: 'Archive' })).toBe(true)
    expect(isDestructive('page.click', { label: 'Save' })).toBe(false)
    expect(isDestructive('page.click', { label: 'Create project' })).toBe(false)
  })

  it('gates clearing the sheet but not deleting one thing', () => {
    // Removing a pool and two loungers is an edit; clearing a yard is not.
    // Asked to clear the whole thing, the agent removed four objects without
    // pausing, and undo is a poor answer once the user has moved on.
    expect(isDestructive('delete.shape', { ids: ['a'] })).toBe(false)
    expect(isDestructive('delete.shape', { ids: ['a', 'b'] })).toBe(false)
    expect(isDestructive('delete.shape', { ids: ['a', 'b', 'c', 'd'] })).toBe(true)
  })

  it('does not gate what undo can bring back', () => {
    // The test is "can the user get it back", not "does it sound alarming".
    // Confirming a shape delete costs the agent the ability to correct its own
    // mistake, and buys nothing that Cmd+Z did not already provide.
    expect(isDestructive('delete.shape')).toBe(false)
  })

  it('every destructive id is a registered command', () => {
    // A gate that names a command which does not exist protects nothing: the
    // model can never trigger the confirmation because it can never call the
    // id in the first place. `project.delete` and `archive.project` were both
    // dead this way until the lifecycle commands landed.
    const known = new Set(all().map(command => command.id))
    for (const id of DESTRUCTIVE) expect(known, id).toContain(id)
  })
})

describe('schema guard', () => {
  it('refuses a genuine union of two value types', () => {
    // This is the case Gemini truly cannot express, as opposed to `.nullable()`,
    // which is collapsed. It must stay refused.
    expect(describable({ type: 'object', properties: { v: { anyOf: [{ type: 'string' }, { type: 'number' }] } } }))
      .toMatch(/anyOf/)
  })

  it('refuses a recursive schema', () => {
    expect(describable({ type: 'object', properties: { child: { $ref: '#/definitions/Node' } } }))
      .toMatch(/\$ref/)
  })

  it('refuses arguments nested past the point of being speakable', () => {
    const deep = { type: 'object', properties: { a: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'object', properties: { d: { type: 'object', properties: { e: { type: 'string' } } } } } } } } } } }
    expect(describable(deep)).toMatch(/nested deeper/)
  })

  it('accepts the flat shapes a spoken command actually uses', () => {
    expect(describable({
      type: 'object',
      properties: {
        name: { type: 'string' },
        lengthFt: { type: 'number' },
        confirm: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    })).toBeNull()
  })
})
