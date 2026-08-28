import { MAX_COORD_FT } from '@/lib/geometry/limits'
import { feetOutOfRange } from '@/lib/commands/dimensions'
/** @vitest-environment jsdom */

// Every route into a dimension, and what happens at the edge of each one.
//
// A reviewer typed 99999 into the inspector's length field. The app took it,
// the layers panel read 99999' x 14', the live quote read $155,928,492, and
// nothing on screen said anything at all. Nothing bounded a dimension anywhere:
// `resize.shape` had `width: z.number().positive()`, `pool.geometry.update` had
// the same on five fields, and the only limits in the codebase
// (`MIN_SIZE_IN` / `MAX_SIZE_IN`) were reachable from the drag handles alone.
//
// This suite is deliberately not a test of the Zod schema in isolation. It goes
// through the same two-phase dispatch the browser and the voice agent both use:
// the fake below is the `/api/commands` route's contract, so an input that the
// schema refuses never reaches a client handler and never reaches a store, and
// the string a person is shown is the string this asserts on.

import { createElement } from 'react'

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { dispatch } from '@/lib/commands/dispatch'
import { humanCommandInputError } from '@/lib/commands/errors'
import {
  MAX_DEPTH_FT,
  MAX_SIZE_FT,
  MAX_SIZE_IN,
  MIN_DEPTH_FT,
  MIN_SIZE_FT,
  MIN_SIZE_IN,
} from '@/lib/geometry/limits'
import { initCommands } from '@/modules/commands/init'
import { get } from '@/modules/commands/registry'
import { useHistoryStore } from '@/modules/editor/state/historyStore'
import { useSelectionStore } from '@/modules/editor/state/selectionStore'
import { type Shape } from '@/modules/editor/state/shapes'
import { useShapesStore } from '@/modules/editor/state/shapesStore'

initCommands()

const POOL_STENCIL = 'pool.rectangle'

/**
 * `/api/commands`, minus the database.
 *
 * The point of the fake is the half it keeps: the input is parsed by the
 * command's own schema and a failure comes back as the sentence
 * `humanCommandInputError` writes. A stub that always answers `ok` — which is
 * what the neighbouring suites use, correctly, for handler behaviour — would
 * make every assertion below pass without a single bound being enforced.
 */
function stubServerValidating(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as { id: string; input: unknown }
      const command = get(body.id)
      if (!command) {
        return { ok: false, status: 404, json: async () => ({ ok: false, error: 'unknown' }) }
      }
      const parsed = command.inputSchema.safeParse(body.input)
      if (!parsed.success) {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            ok: false,
            error: humanCommandInputError(command.label, parsed.error, body.input),
          }),
        }
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: {} }) }
    }),
  )
}

async function run<O>(id: string, input: unknown): Promise<O> {
  const result = await dispatch<unknown, O>(id, input)
  if (!result.ok) throw new Error(`${id} was expected to succeed but said: ${result.error}`)
  return result.data
}

async function refusal(id: string, input: unknown): Promise<string> {
  const result = await dispatch<unknown, unknown>(id, input)
  if (result.ok) throw new Error(`${id} accepted ${JSON.stringify(input)} and should not have`)
  return result.error
}

function shapes(): Shape[] {
  return useShapesStore.getState().shapes
}

function shapeById(id: string): Shape {
  const found = shapes().find((s) => s.id === id)
  if (!found) throw new Error('the fixture pool went missing')
  return found
}

async function addPool(): Promise<string> {
  const { shapeId } = await run<{ shapeId: string }>('add.shape', {
    stencilId: POOL_STENCIL,
    x: 0,
    y: 0,
    width: 30 * 12,
    height: 14 * 12,
  })
  return shapeId
}

beforeEach(() => {
  useShapesStore.getState().hydrate([])
  useHistoryStore.getState().reset()
  useSelectionStore.getState().clear()
  stubServerValidating()
  render(createElement(ClientCommandHandlers))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the reviewer’s 99999', () => {
  it('is refused, and the pool is exactly the size it was', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }

    const error = await refusal('pool.geometry.update', { id, lengthFt: 99_999 })

    expect(shapeById(id)).toEqual(before)
    expect(error).toContain('Pool length must be between 1 and 400 feet')
    expect(error).toContain('99,999')
    expect(error).toContain('Nothing was changed')
  })

  it('says nothing a person cannot act on', async () => {
    const id = await addPool()
    const error = await refusal('pool.geometry.update', { id, lengthFt: 99_999 })

    // The failure mode this replaced, verbatim from the audit log:
    //   invalid input: lengthFt: Number must be less than or equal to 400
    // A Zod issue list is a developer's sentence. None of its furniture may
    // reach a toast.
    expect(error).not.toMatch(/invalid input|ZodError|issues|z\.number|lengthFt/i)
  })
})

describe('pool.geometry.update bounds', () => {
  it('accepts the ends of the range it advertises', async () => {
    const id = await addPool()
    await run('pool.geometry.update', { id, lengthFt: MAX_SIZE_FT, widthFt: MIN_SIZE_FT })
    expect(shapeById(id).width).toBeCloseTo(MAX_SIZE_FT * 12, 6)
    expect(shapeById(id).height).toBeCloseTo(MIN_SIZE_FT * 12, 6)
  })

  it.each([
    ['just over the top', { lengthFt: MAX_SIZE_FT + 0.01 }],
    ['just under the bottom', { widthFt: MIN_SIZE_FT - 0.01 }],
    ['zero', { lengthFt: 0 }],
    ['negative', { widthFt: -20 }],
    ['infinite', { lengthFt: Number.POSITIVE_INFINITY }],
    ['not a number at all', { lengthFt: Number.NaN }],
  ])('refuses a length %s, and changes nothing', async (_name, patch) => {
    const id = await addPool()
    const before = { ...shapeById(id) }
    await refusal('pool.geometry.update', { id, ...patch })
    expect(shapeById(id)).toEqual(before)
  })

  it('refuses a depth outside what a pool holds water at', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }

    const tooDeep = await refusal('pool.geometry.update', { id, deepDepthFt: MAX_DEPTH_FT + 1 })
    expect(tooDeep).toContain(`between ${MIN_DEPTH_FT} and ${MAX_DEPTH_FT} feet`)

    await refusal('pool.geometry.update', { id, shallowDepthFt: 0 })
    expect(shapeById(id)).toEqual(before)
  })
})

describe('a shallow end deeper than the deep end', () => {
  it('is refused when both arrive together', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }

    const error = await refusal('pool.geometry.update', {
      id,
      shallowDepthFt: 9,
      deepDepthFt: 4,
    })

    expect(error).toContain('shallow end cannot be deeper than the deep end')
    expect(shapeById(id)).toEqual(before)
  })

  it('is refused when only one arrives and the pool supplies the other', async () => {
    // The inspector sends one field per box, so a check that only fires when
    // both are present is a check anybody side-steps by using the UI normally.
    const id = await addPool()
    await run('pool.geometry.update', { id, shallowDepthFt: 3, deepDepthFt: 6 })
    const before = { ...shapeById(id) }

    const error = await refusal('pool.geometry.update', { id, shallowDepthFt: 9 })

    expect(error).toContain('shallow end cannot be deeper than the deep end')
    expect(shapeById(id)).toEqual(before)
  })

  it('allows a flat-bottomed pool, where the two are equal', async () => {
    const id = await addPool()
    await run('pool.geometry.update', { id, shallowDepthFt: 5, deepDepthFt: 5 })
    const pool = shapeById(id) as Shape & { depthShallow: number; depthDeep: number }
    expect(pool.depthShallow).toBe(5)
    expect(pool.depthDeep).toBe(5)
  })
})

describe('the other routes into a size', () => {
  it('add.shape refuses a stencil bigger than the lot', async () => {
    const error = await refusal('add.shape', {
      stencilId: POOL_STENCIL,
      x: 0,
      y: 0,
      width: MAX_SIZE_IN + 1,
      height: 120,
    })
    expect(error).toContain('inches')
    expect(shapes()).toHaveLength(0)
  })

  it('resize.shape refuses below the size a handle can be grabbed at', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }
    await refusal('resize.shape', { id, width: MIN_SIZE_IN - 1, height: 120 })
    expect(shapeById(id)).toEqual(before)
  })

  it('resize.shape and the drag handles agree at both ends', async () => {
    // One set of numbers, two ways in. They lived in `handles.ts` and bounded
    // only the drag, which is how the typed path came to have none.
    const id = await addPool()
    await run('resize.shape', { id, width: MIN_SIZE_IN, height: MAX_SIZE_IN })
    expect(shapeById(id).width).toBe(MIN_SIZE_IN)
    expect(shapeById(id).height).toBe(MAX_SIZE_IN)
  })

  it('rotate.shape refuses more than a full turn', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }
    await refusal('rotate.shape', { id, degrees: 99_999 })
    expect(shapeById(id)).toEqual(before)
  })

  it('move.shape refuses a coordinate off the edge of the world', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }
    await refusal('move.shape', { id, x: 9_999_999, y: 0 })
    expect(shapeById(id)).toEqual(before)
  })

  it('set.pool.targetArea refuses an area no footprint can reach', async () => {
    const id = await addPool()
    const before = { ...shapeById(id) }
    await refusal('set.pool.targetArea', { id, targetAreaSqft: 5_000_000 })
    expect(shapeById(id)).toEqual(before)
  })
})

describe('what the voice agent is told', () => {
  // The agent dispatches the same commands over the same route, so a spoken
  // "make it ninety nine thousand feet" arrives as `pool.geometry.update` with
  // `lengthFt: 99999`. What comes back is what it reads out.
  it('is a sentence with the limit in it, not a schema dump', async () => {
    const id = await addPool()
    const spoken = await refusal('pool.geometry.update', { id, lengthFt: 99_999 })

    expect(spoken).toMatch(/^“Update pool geometry” could not run\./)
    expect(spoken).toContain('must be between 1 and 400 feet')
    expect(spoken).toContain('You entered 99,999')
    expect(spoken.split(' ').length).toBeLessThan(40)
  })

  it('tells the model the range up front, so it can ask before being refused', async () => {
    // `.min`/`.max` survive `zodToJsonSchema` as `minimum`/`maximum`, which are
    // two of the few keywords the Live API accepts. `.positive()` emitted
    // `exclusiveMinimum`, which is pruned, so the model was told nothing.
    const { buildToolSurface } = await import('@/modules/voice/tools')
    const surface = buildToolSurface(['shape'])
    const tool = surface.tools.find(t => t.name === 'pool.geometry.update')
    const length = tool?.parameters.properties['lengthFt'] as
      | { minimum?: number; maximum?: number }
      | undefined

    expect(length?.minimum).toBe(MIN_SIZE_FT)
    expect(length?.maximum).toBe(MAX_SIZE_FT)
    expect(surface.refused.map(r => r.name)).not.toContain('pool.geometry.update')
  })
})

describe('the number quoted back to a person', () => {
  // The inspector works in feet and multiplies by twelve before dispatching, so
  // a refusal from the command names a figure nobody typed: enter 99999 and be
  // told "you entered 1,199,988". Correct, and useless to read.
  it('is the one they typed, in the unit they typed it in', () => {
    const message = feetOutOfRange('Y position', 99_999, -MAX_COORD_FT, MAX_COORD_FT)
    expect(message).toContain('99,999')
    expect(message).toContain('feet')
    expect(message).not.toContain('1,199,988')
  })

  it('says nothing at all when the value is fine', () => {
    expect(feetOutOfRange('Y position', 20, -MAX_COORD_FT, MAX_COORD_FT)).toBeNull()
  })

  it('refuses a value that is not a number', () => {
    expect(feetOutOfRange('Y position', Number.NaN, -MAX_COORD_FT, MAX_COORD_FT)).not.toBeNull()
  })
})
