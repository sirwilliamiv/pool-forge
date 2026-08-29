/** @vitest-environment jsdom */

// A note must never reach a customer.
//
// "Check the gas line clearance" and "customer wants the steps moved" are the
// two examples the feature was asked for, and both would be embarrassing on a
// proposal and dangerous on a permit sheet.
//
// What makes that true is that a note is not a shape. Every document renders
// `shapes`, and `snapshot.ts` reads that one key off `rootJson` by name, so a
// note in the same column is unreachable from any of them. Nothing had to be
// added to `exportVisibility` for this: that field decides which *stencils* are
// customer-facing, and a note is not a stencil.
//
// A structural argument is exactly the kind that quietly stops holding, though
// — the day somebody decides notes should print "so the crew can see them",
// they print for the customer too. So the second test is static: no document,
// and no loader that feeds one, may read the notes at all.

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseDrawingPayload, serializeDrawingPayload } from '@/modules/editor/drawing-payload'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

const SECRET = 'Check the gas line clearance before the pour'

const POOL: Shape = {
  id: 's1',
  kind: ShapeKind.RECTANGLE_POOL,
  x: 0,
  y: 0,
  width: 360,
  height: 168,
  rotation: 0,
  zIndex: 1,
  locked: false,
  hidden: false,
} as Shape

/** Everything a customer can be handed, and the loader that feeds them. */
const CUSTOMER_FACING = [
  'src/components/exports/ProposalDocument.tsx',
  'src/components/exports/DrawingSvg.tsx',
  'src/components/exports/TechnicalPlanSvg.tsx',
  'src/components/exports/SitePlanDocument.tsx',
  'src/components/exports/ConstructionDocument.tsx',
  'src/components/exports/ScreenEnclosureQuoteDocument.tsx',
  'src/modules/projects/snapshot.ts',
]

/** Where the notes are read on purpose, so the pattern below is known to bite. */
const THE_EDITOR = 'src/components/editor/three/CommentPins.tsx'

const READS_NOTES = /commentsStore|comments\/model|CommentCard|\.comments\b/

describe('notes are internal', () => {
  it('is stored on the drawing, and is not one of its shapes', () => {
    const stored = serializeDrawingPayload({
      shapes: [POOL],
      survey: null,
      comments: [
        {
          id: 'c1',
          x: 60,
          y: 60,
          body: SECRET,
          authorId: 'user-1',
          authorName: 'Dana Reyes',
          createdAt: '2026-08-19T10:00:00.000Z',
          resolved: false,
        },
      ],
    })
    const loaded = parseDrawingPayload(stored)

    // Really saved: every claim below would pass trivially if the note had
    // never been written in the first place.
    expect(JSON.stringify(stored)).toContain(SECRET)
    expect(loaded.comments?.[0]?.body).toBe(SECRET)

    // And unreachable from the only thing a document is given.
    expect(JSON.stringify(loaded.shapes)).not.toContain(SECRET)
    expect(JSON.stringify(loaded.shapes)).not.toContain('Dana Reyes')
  })

  it('the pattern this is checked with actually bites', () => {
    // Guards the guard. A regex that stopped matching would make the whole
    // check below pass while proving nothing.
    expect(READS_NOTES.test(readFileSync(THE_EDITOR, 'utf8'))).toBe(true)
  })

  it('nothing a customer is handed reads the notes', () => {
    for (const file of CUSTOMER_FACING) {
      const source = readFileSync(file, 'utf8')
      expect(source.length, `${file} is missing or empty`).toBeGreaterThan(200)
      expect(
        READS_NOTES.test(source),
        `${file} reads the drawing's notes. Notes are internal: they must not reach a customer document.`,
      ).toBe(false)
    }
  })
})
