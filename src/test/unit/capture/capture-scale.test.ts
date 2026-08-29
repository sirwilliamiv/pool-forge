// The size this feature was actually designed around.
//
// A 30 by 20 metre yard at 10cm spacing is 60,000 cells. Everything else in the
// suite runs on a 40 by 30 grid because a property test that takes ninety
// seconds is a property test nobody runs, but a pipeline that only works at
// 1,200 cells is a pipeline that fails on the first real yard. So this file
// does the real one, once, end to end, and puts a time budget on it.
//
// The budget is deliberately loose: this is CI on shared hardware, and the
// failure worth catching is quadratic behaviour, not a slow afternoon.

import { describe, expect, it } from 'vitest'

import { coverageOver, fieldBounds, measuredCellCount } from '@/modules/capture/coverage'
import { decodeCapture } from '@/modules/capture/decode'
import { packHeightfield } from '@/modules/capture/storage'
import { existingSurfaceFrom, reconstructionError } from '@/modules/capture/surface'
import { cutFillBetween, emptyGrade, maxSlope } from '@/modules/editor/grade/model'
import { both, fadedEdges, skippedStripe, swale, syntheticYard } from '@/test/fixtures/yards'

/** 30m by 20m at 10cm. The number in the brief. */
const COLS = 300
const ROWS = 200

describe('a real yard, at the size it actually arrives', () => {
  it('goes from payload to priced earthwork', () => {
    const started = Date.now()

    const payload = syntheticYard({
      cols: COLS,
      rows: ROWS,
      cellSizeM: 0.1,
      // A lot that falls, with the drainage swale that decides the dig, one
      // stripe the person skipped because the shed was there, and the faded
      // edges LiDAR returns in direct sun.
      terrain: swale(0.9, 20, 12, 0.5, 2),
      coverage: both(skippedStripe(80, 96), fadedEdges(COLS, ROWS, 4)),
      encoding: 'base64',
      siteElevationFt: 7.5,
      benchmarkLabel: 'top of slab',
    })

    // Base64 is what a phone on a cellular connection should send: about a
    // fifth of the JSON.
    const wire = JSON.stringify(payload).length
    expect(wire).toBeLessThan(2_000_000)

    const field = decodeCapture(payload)
    expect(field.cols * field.rows).toBe(60_000)
    expect(field.benchmarkLabel).toBe('top of slab')
    expect(field.datumFt).toBe(7.5)

    const measured = measuredCellCount(field)
    expect(measured).toBeGreaterThan(40_000)
    expect(measured).toBeLessThan(60_000)

    const report = coverageOver(field, fieldBounds(field))
    expect(report.complete).toBe(false)
    expect(report.fraction).toBeGreaterThan(0.7)
    expect(report.fraction).toBeLessThan(1)
    // The skipped stripe is one connected hole, and it is much the largest.
    expect(report.largestGapSqft).toBeGreaterThan(report.gapAreaSqft * 0.4)

    const built = existingSurfaceFrom(field, null)
    // The whole design decision in one assertion: 60,000 measured cells become
    // a few dozen ordinary survey shots, so nothing downstream needs a special
    // case and nothing downstream gets slower.
    expect(built.grade.points.length).toBeLessThanOrEqual(65)
    // Two inches on average against a yard with a half-metre drainage swale
    // cut across it, which is what a smooth interpolator can do with a trench.
    // The number is published rather than hidden: `maxErrorFt` rides along on
    // the surface and on the provenance the panel reads.
    const error = reconstructionError(field, built.grade)
    expect(error.meanFt).toBeLessThan(0.25)
    expect(built.maxErrorFt).toBeCloseTo(error.maxFt, 9)

    // And the existing chain runs on it unchanged.
    const bounds = fieldBounds(field)
    const finished = { ...emptyGrade(), enabled: true, baseElevationFt: 4 }
    const earthwork = cutFillBetween(built.grade, finished, bounds)
    expect(earthwork.cutYards).toBeGreaterThan(0)
    expect(Number.isFinite(earthwork.fillYards)).toBe(true)
    expect(maxSlope(built.grade, bounds)).toBeGreaterThan(0)

    // 300KB of bytes rather than 1.2MB of JSON text.
    const packed = packHeightfield(field)
    expect(packed.elevationsFt.byteLength).toBe(60_000 * 4)
    expect(packed.coverage.byteLength).toBe(60_000)

    expect(Date.now() - started).toBeLessThan(20_000)
  })

  it('refuses a grid larger than it will ever process', () => {
    // Claimed cells are checked before the arrays are read, so a payload
    // claiming forty million cells is refused before it can ask for the memory.
    expect(() =>
      decodeCapture({
        ...syntheticYard({ cols: 4, rows: 4 }),
        frame: { originEastM: 0, originNorthM: 0, cellSizeM: 0.1, cols: 60_000, rows: 60_000 },
      }),
    ).toThrow(/too big|could not be read/)
  })
})
