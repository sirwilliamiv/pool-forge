// Property tests for the registry → Gemini tool converter.
//
// This layer failed in production in the worst possible way: one unsupported
// keyword in one command's schema made the Live API reject the entire setup
// message, so *every* tool disappeared and the failure surfaced as a socket
// close that read like an auth problem. The unit tests all passed.
//
// So these check the invariant that actually matters — nothing the API cannot
// parse ever reaches it — over generated schemas rather than chosen ones, and
// over the real registry as it stands today.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { initCommands } from '@/modules/commands/init'
import { all, type CommandCategory } from '@/modules/commands/registry'
import { buildToolSurface, describable, pruneKeywords } from '@/modules/voice/tools'
import { scopeFor, VOICE_SCREENS } from '@/modules/voice/scope'

initCommands()

/**
 * Exactly the keyword set `pruneKeywords` keeps.
 *
 * Duplicated here on purpose. A test that imported the implementation's own list
 * would pass no matter what that list said, which is not a test of anything.
 */
const ALLOWED = new Set([
  'type',
  'format',
  'title',
  'description',
  'nullable',
  'default',
  'items',
  'minItems',
  'maxItems',
  'enum',
  'properties',
  'required',
  'minProperties',
  'maxProperties',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'example',
  'propertyOrdering',
])

/** Keywords Zod emits that the Live API has no field for. */
const REJECTED = [
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'additionalProperties',
  'const',
  '$schema',
  'patternProperties',
  'uniqueItems',
]

/** An arbitrary JSON-Schema-ish object, freely mixing legal and illegal keywords. */
const schemaNode: fc.Arbitrary<unknown> = fc.letrec(tie => ({
  node: fc.oneof(
    { depthSize: 'small' },
    fc.constantFrom('string', 'number', 'integer', 'boolean').map(type => ({ type })),
    fc.record({
      type: fc.constant('object'),
      properties: fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), tie('node'), {
        maxKeys: 4,
      }),
      required: fc.array(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 3 }),
      exclusiveMinimum: fc.integer(),
      additionalProperties: fc.boolean(),
    }),
    fc.record({
      type: fc.constant('array'),
      items: tie('node'),
      uniqueItems: fc.boolean(),
      minItems: fc.nat({ max: 5 }),
    }),
    fc.record({
      type: fc.constant('number'),
      minimum: fc.integer(),
      exclusiveMinimum: fc.integer(),
      multipleOf: fc.integer({ min: 1, max: 10 }),
    }),
  ),
})).node

/** Every key present anywhere in a nested schema, ignoring property names. */
function keywordsIn(node: unknown, insideProperties = false): string[] {
  if (Array.isArray(node)) return node.flatMap(entry => keywordsIn(entry, false))
  if (!node || typeof node !== 'object') return []

  const found: string[] = []
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    // Keys under `properties` are the caller's field names, not keywords.
    if (!insideProperties) found.push(key)
    found.push(...keywordsIn(value, key === 'properties'))
  }
  return found
}

describe('pruneKeywords', () => {
  it('leaves nothing the Live API cannot parse', () => {
    // The whole point. One survivor rejects the entire setup message.
    fc.assert(
      fc.property(schemaNode, node => {
        for (const keyword of keywordsIn(pruneKeywords(node))) {
          expect(ALLOWED.has(keyword), `"${keyword}" survived pruning`).toBe(true)
        }
      }),
      { numRuns: 500 },
    )
  })

  it('is idempotent', () => {
    // Pruning twice must not differ from pruning once, or the surface depends on
    // how many times it happened to be built.
    fc.assert(
      fc.property(schemaNode, node => {
        const once = pruneKeywords(node)
        expect(pruneKeywords(once)).toEqual(once)
      }),
      { numRuns: 300 },
    )
  })

  it('never invents a keyword that was not there', () => {
    fc.assert(
      fc.property(schemaNode, node => {
        const before = new Set(keywordsIn(node))
        for (const keyword of keywordsIn(pruneKeywords(node))) {
          expect(before.has(keyword)).toBe(true)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('keeps the field names under properties, whatever they are called', () => {
    // Property names are user data. Filtering them against the keyword list
    // would silently delete arguments — an `enum` or `type` field would vanish.
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.constant({ type: 'string' }), {
          minKeys: 1,
          maxKeys: 6,
        }),
        properties => {
          const pruned = pruneKeywords({ type: 'object', properties }) as {
            properties: Record<string, unknown>
          }
          expect(Object.keys(pruned.properties).sort()).toEqual(Object.keys(properties).sort())
        },
      ),
      { numRuns: 300 },
    )
  })

  it('does not rescue a shape that should have been refused', () => {
    // Order matters in the converter: `describable` judges the shape, and only
    // then is it pruned. If pruning ran first it would delete the `anyOf` and
    // publish a command whose real schema cannot be expressed.
    const polymorphic = {
      type: 'object',
      properties: { v: { anyOf: [{ type: 'string' }, { type: 'number' }] } },
    }
    expect(describable(polymorphic)).toMatch(/anyOf/)
  })
})

describe('the registry as it stands', () => {
  it('publishes nothing carrying a rejected keyword', () => {
    // The regression guard for the real failure, checked against every command
    // actually registered rather than a sample.
    const categories = [...new Set(all().map(command => command.category))] as CommandCategory[]
    const { tools } = buildToolSurface(categories)
    expect(tools.length).toBeGreaterThan(0)

    for (const tool of tools) {
      const keywords = new Set(keywordsIn(tool.parameters))
      for (const bad of REJECTED) {
        expect(keywords.has(bad), `${tool.name} publishes "${bad}"`).toBe(false)
      }
      for (const keyword of keywords) {
        expect(ALLOWED.has(keyword), `${tool.name} publishes "${keyword}"`).toBe(true)
      }
    }
  })

  it('gives every tool a name the API accepts and a description worth reading', () => {
    const categories = [...new Set(all().map(command => command.category))] as CommandCategory[]
    for (const tool of buildToolSurface(categories).tools) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_.-]{1,64}$/)
      expect(tool.description.length).toBeGreaterThan(10)
      expect(tool.parameters.type).toBe('object')
    }
  })

  it('keeps every screen scope and its surface in exact agreement', () => {
    // `allows` is what the session re-checks each tool call against. If it ever
    // disagreed with the list handed to the model, the agent would be refused
    // for calling a tool it was told it had.
    for (const screen of VOICE_SCREENS) {
      const scope = scopeFor(screen)
      const published = new Set(scope.surface.tools.map(tool => tool.name))

      for (const name of published) expect(scope.allows(name)).toBe(true)
      for (const command of all()) {
        if (!published.has(command.id)) {
          expect(scope.allows(command.id), `${screen} allows unpublished ${command.id}`).toBe(false)
        }
      }
    }
  })

  it('accounts for every command on every screen', () => {
    // Published or refused with a stated reason. Nothing may fall through the
    // gap: a command that is neither is one nobody knows is missing.
    for (const screen of VOICE_SCREENS) {
      const scope = scopeFor(screen)
      const inScope = all().filter(command => scope.categories.includes(command.category))
      const seen = new Set([
        ...scope.surface.tools.map(tool => tool.name),
        ...scope.surface.refused.map(entry => entry.name),
      ])
      for (const command of inScope) {
        expect(seen.has(command.id), `${screen} loses ${command.id}`).toBe(true)
      }
    }
  })
})
