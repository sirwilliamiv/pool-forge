// Does every row the palette offers actually run?
//
// This is the defect a first-time reviewer hit within a minute of opening the
// product. The palette's "Add" rows sent `{ kind: 'waterfall' }` to `add.shape`,
// whose schema has always asked for `{ stencilId, x, y }`, so one row showed the
// raw text `invalid input: stencilId: Required; x: Required; y: Required` and
// another looked like it did nothing at all. "Run validation" sent `{}` to a
// command that needs a projectId. Every suggestion under "Suggested for this
// design" posted a wrapper command that had no client handler, was told ok, and
// changed nothing.
//
// Every one of those was a row whose input nothing had ever parsed. So this file
// parses them: each row is built the way the palette builds it and handed to the
// registered command's own schema. A row that cannot run cannot ship.

import { describe, expect, it } from 'vitest'

import {
  PALETTE_ROWS,
  asExportCommandId,
  type PaletteRowContext,
} from '@/lib/commands/palette-rows'
import { initCommands } from '@/modules/commands/init'
import { all, get } from '@/modules/commands/registry'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

initCommands()

/** An empty canvas, which is what a new project actually opens with. */
const EMPTY: PaletteRowContext = { shapes: [], projectId: 'project-under-test' }

/** A canvas with a pool on it, so staging has something to stage beside. */
const DRAWN: PaletteRowContext = {
  shapes: [
    {
      id: 'shape-1',
      kind: ShapeKind.RECTANGLE_POOL,
      x: 0,
      y: 0,
      width: 360,
      height: 168,
      rotation: 0,
      locked: false,
      hidden: false,
    } as Shape,
  ],
  projectId: 'project-under-test',
}

describe('every palette row resolves to a command that will accept it', () => {
  it('offers rows at all', () => {
    // Guards the guard: an empty list would make every assertion below pass
    // while checking nothing.
    expect(PALETTE_ROWS.length).toBeGreaterThan(5)
  })

  for (const ctx of [EMPTY, DRAWN]) {
    const canvas = ctx.shapes.length === 0 ? 'an empty canvas' : 'a drawn canvas'

    for (const row of PALETTE_ROWS) {
      it(`${row.id} runs on ${canvas}`, () => {
        const calls = row.build(ctx)
        // A row that cannot act right now is allowed, but only by not being
        // offered: the palette drops empty builds. What is never allowed is a
        // row that is offered and does nothing.
        if (calls.length === 0) return

        for (const call of calls) {
          const command = get(call.commandId)
          expect(command, `${row.id} names an unregistered command ${call.commandId}`).toBeTruthy()

          const parsed = command!.inputSchema.safeParse(call.input)
          expect(
            parsed.success,
            `${row.id} would be refused by ${call.commandId}: ${
              parsed.success
                ? ''
                : parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
            }`,
          ).toBe(true)
        }
      })
    }
  }

  it('an add row places at a real position rather than nowhere', () => {
    // The specific bug: the old rows carried no coordinates at all. Asserted on
    // the value, not just on the schema, because `x: 0, y: 0` would parse and
    // stack every object on the origin.
    const calls = PALETTE_ROWS.filter(row => row.group === 'add').flatMap(row => row.build(DRAWN))
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const input = call.input as { stencilId?: string; x?: number; y?: number }
      expect(typeof input.stencilId, `${call.commandId} sent no stencil`).toBe('string')
      expect(Number.isFinite(input.x), `${call.commandId} sent no x`).toBe(true)
      expect(Number.isFinite(input.y), `${call.commandId} sent no y`).toBe(true)
    }
  })

  it('two lights are two calls, at two different places', () => {
    const row = PALETTE_ROWS.find(r => r.id === 'add.two-lights')
    expect(row, 'the row a reviewer clicked and was shown a Zod error').toBeTruthy()
    const calls = row!.build(DRAWN)
    expect(calls).toHaveLength(2)
    const positions = calls.map(call => `${call.input.x},${call.input.y}`)
    expect(new Set(positions).size, 'both lights landed on the same spot').toBe(2)
  })

  it('every export row names a real export command', () => {
    const exportRows = PALETTE_ROWS.filter(row => row.via === 'export')
    expect(exportRows.length).toBeGreaterThan(0)
    for (const row of exportRows) {
      for (const call of row.build(EMPTY)) {
        expect(asExportCommandId(call.commandId), `${row.id} is not an export command`).toBe(
          call.commandId,
        )
      }
    }
  })

  it('no row dispatches a command that only reports success', () => {
    // A client-side command with no handler returns ok and changes nothing,
    // which is exactly how the suggestion rows failed. `wiring.test` proves the
    // handlers exist; this proves the palette only reaches commands it covers.
    const clientOnly = new Set(
      all()
        .filter(command => command.runsOn === 'client')
        .map(command => command.id),
    )
    const stubs = new Set(all().filter(command => command.unimplemented).map(command => command.id))

    const reached = PALETTE_ROWS.flatMap(row => row.build(DRAWN)).map(call => call.commandId)
    expect(reached.filter(id => stubs.has(id))).toEqual([])
    // Sanity: the add rows do go through a client command, so the check above is
    // looking at the right set.
    expect(reached.some(id => clientOnly.has(id))).toBe(true)
  })
})
