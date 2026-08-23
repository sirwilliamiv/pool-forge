/** @vitest-environment jsdom */

// Does the panel that prints the earthwork say where the ground came from?
//
// This is the part that makes the whole feature worth building. The cut and
// fill is a line on a quote, and a cut and fill computed across a stripe
// nobody walked looks exactly like one computed across measured ground: same
// number, same font, same confidence. The only place a person could ever find
// out is here, next to the number, so this file renders the real panel and
// reads the real words.
//
// The app's existing voice for this is "Drawn but not priced". These tests hold
// the ground version of it to the same standard: it appears when it should, it
// says what is missing and how much, and it stays quiet when there is nothing
// to warn about.

import { createElement } from 'react'

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GradePanel } from '@/components/editor/shell/GradePanel'
import { coverageOver, fieldBounds } from '@/modules/capture/coverage'
import { decodeCapture } from '@/modules/capture/decode'
import { existingSurfaceFrom, provenanceFrom } from '@/modules/capture/surface'
import { useGradeStore } from '@/modules/editor/state/gradeStore'
import { useShapesStore } from '@/modules/editor/state/shapesStore'
import { fullyWalked, hole, skippedStripe, slope, smallYard } from '@/test/fixtures/yards'

/** Ingest a yard the way the command does, and put it in the store. */
function walk(coverage: (col: number, row: number) => number): void {
  const field = decodeCapture(smallYard({ terrain: slope(), coverage }))
  const built = existingSurfaceFrom(field, null)
  built.grade.capture = provenanceFrom(field, coverageOver(field, fieldBounds(field)), built)
  useGradeStore.getState().hydrate({
    existing: built.grade,
    finished: { baseElevationFt: -3, falloff: 2, enabled: true, points: [] },
  })
}

beforeEach(() => {
  useShapesStore.getState().hydrate([])
  useGradeStore.getState().hydrate(null)
})

afterEach(() => {
  // Unmount first. Resetting the store under a mounted panel is a React state
  // update outside act(), which is a warning today and a flake tomorrow.
  cleanup()
  useGradeStore.getState().hydrate(null)
})

describe('the grade panel says where its ground came from', () => {
  it('warns, and quantifies, when a stripe was skipped', () => {
    walk(skippedStripe(12, 18))
    render(createElement(GradePanel))

    // The number it is warning about is right there in the same box.
    expect(screen.getByText('Cut')).toBeInTheDocument()
    expect(screen.getByText(/Interpolated across unwalked ground/i)).toBeInTheDocument()
    expect(screen.getByText(/never walked/i)).toBeInTheDocument()
    expect(screen.getByText(/sq ft/i)).toBeInTheDocument()
    expect(screen.getByText(/is an estimate/i)).toBeInTheDocument()
    // And how much of it was real.
    expect(screen.getByText('Ground walked')).toBeInTheDocument()
  })

  it('names the largest hole when the gaps are not one piece', () => {
    walk(hole(8, 20, 6, 18))
    render(createElement(GradePanel))
    expect(screen.getByText(/never walked/i)).toBeInTheDocument()
  })

  it('stays quiet when the whole yard was walked', () => {
    // A caveat that shows up when everything is fine is a caveat people stop
    // reading, and this one has to still be read on the day it matters.
    walk(fullyWalked)
    render(createElement(GradePanel))

    expect(screen.getByText('Cut')).toBeInTheDocument()
    expect(screen.getByText('Ground walked')).toBeInTheDocument()
    expect(screen.getByText('All of it')).toBeInTheDocument()
    expect(screen.queryByText(/Interpolated across unwalked ground/i)).toBeNull()
  })

  it('says the ground is an assumption when nobody has measured anything', () => {
    useGradeStore.getState().hydrate({
      existing: { baseElevationFt: 0, falloff: 2, enabled: true, points: [] },
      finished: { baseElevationFt: -3, falloff: 2, enabled: true, points: [] },
    })
    render(createElement(GradePanel))
    expect(screen.getByText(/assumes flat ground at the datum/i)).toBeInTheDocument()
  })

  it('does not lecture a builder who shot the site by hand', () => {
    // Hand-entered elevations are real measurements taken by the person signing
    // the contract. Warning about every one of them is how the warning stops
    // meaning anything.
    useGradeStore.getState().hydrate({
      existing: {
        baseElevationFt: 0,
        falloff: 2,
        enabled: true,
        points: [
          { id: 'a', x: 0, y: 0, elevationFt: 0, kind: 'existing' },
          { id: 'b', x: 240, y: 240, elevationFt: -2, kind: 'existing' },
        ],
      },
      finished: { baseElevationFt: -3, falloff: 2, enabled: true, points: [] },
    })
    render(createElement(GradePanel))

    expect(screen.getByText('Cut')).toBeInTheDocument()
    expect(screen.queryByText(/assumes flat ground/i)).toBeNull()
    expect(screen.queryByText(/Interpolated across unwalked ground/i)).toBeNull()
    expect(screen.queryByText('Ground walked')).toBeNull()
  })
})
