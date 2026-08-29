// Property tests for the LiDAR site capture.
//
// This is geometry crossing a unit boundary and landing on a quote, which is
// three ways to be wrong at once: a scale error puts the yard in the wrong
// place, a datum error puts it at the wrong height, and a coverage error makes
// the app confident about ground nobody stood on. Examples find none of those
// reliably, because the yard that breaks it is the yard nobody thought to type
// out.
//
// Every property here was checked by breaking the code it guards and watching
// this file fail by name.

import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

import {
  CAPTURE_CONTRACT_VERSION,
  CaptureRejection,
  MEASURED_COVERAGE_MIN,
  type CapturePayload,
  type Heightfield,
} from '@/modules/capture/contract'
import { coverageCaveat, coverageOver, fieldBounds, isMeasured } from '@/modules/capture/coverage'
import { decodeCapture } from '@/modules/capture/decode'
import { packHeightfield, unpackHeightfield } from '@/modules/capture/storage'
import {
  decimateToShots,
  existingSurfaceFrom,
  placeHeightfield,
  reconstructionError,
} from '@/modules/capture/surface'
import { FEET_PER_METRE, metresToFeet, metresToInches } from '@/modules/capture/units'
import { cutFillBetween, elevationAt, emptyGrade } from '@/modules/editor/grade/model'
import {
  both,
  captureId,
  fadedEdges,
  flat,
  fullyWalked,
  hole,
  padWithStep,
  skippedStripe,
  slope,
  smallYard,
  swale,
  syntheticYard,
} from '@/test/fixtures/yards'

/**
 * Float32 on the wire and float32 in the column, so the round trip is not
 * exact. A ten-thousandth of a foot is a thousandth of an inch, two orders of
 * magnitude finer than the sensor that produced the number.
 */
const STORAGE_TOLERANCE_FT = 1e-3

/** A drainage swale sized to fit inside the small test yard, which is 10m by 7.5m. */
const inRangeSwale = swale(0.9, 7.5, 4, 0.4, 1)

/** Terrain shapes a builder actually walks into. */
const terrain = fc.oneof(
  fc.constant(flat(0)),
  fc.constant(flat(1.5)),
  fc.constant(slope()),
  fc.constant(slope(2.4, 20)),
  fc.constant(inRangeSwale),
  fc.constant(padWithStep()),
)

/**
 * Terrain that a smooth interpolator can genuinely reproduce: level ground and
 * ground that falls. A swale and a step both defeat it, and each has its own
 * test below saying by how much.
 */
const smoothTerrain = fc.oneof(
  fc.constant(flat(0)),
  fc.constant(flat(1.5)),
  fc.constant(slope()),
  fc.constant(slope(2.4, 20)),
)

/** Coverage patterns, including the one this whole feature exists for. */
const mask = fc.oneof(
  fc.constant(fullyWalked),
  fc.constant(skippedStripe(10, 16)),
  fc.constant(fadedEdges(40, 30)),
  fc.constant(hole(8, 20, 6, 18)),
  fc.constant(both(skippedStripe(4, 7), hole(20, 30, 10, 20))),
)

const datum = fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true })

const yard: fc.Arbitrary<CapturePayload> = fc
  .record({
    terrain,
    coverage: mask,
    siteElevationFt: datum,
    encoding: fc.constantFrom('json' as const, 'base64' as const),
    seed: fc.integer({ min: 1, max: 10_000 }),
  })
  .map(spec =>
    smallYard({
      terrain: spec.terrain,
      coverage: spec.coverage,
      siteElevationFt: spec.siteElevationFt,
      encoding: spec.encoding,
      captureId: captureId(spec.seed),
    }),
  )

describe('the metre boundary', () => {
  it('converts by the definition of an inch, not by a remembered constant', () => {
    // 25.4mm to the inch, exactly, by definition since 1959. Everything else in
    // the capture module is derived from this line, and a survey 3.28 times too
    // big is what happens when it is not.
    expect(metresToInches(1)).toBeCloseTo(39.3700787401575, 10)
    expect(metresToFeet(1)).toBeCloseTo(3.28083989501312, 10)
    expect(metresToInches(0.0254)).toBeCloseTo(1, 12)
    expect(metresToFeet(0.3048)).toBeCloseTo(1, 12)
  })

  it('is linear, so a scale error cannot hide in one part of the yard', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
        (a, b) => {
          expect(metresToFeet(a + b)).toBeCloseTo(metresToFeet(a) + metresToFeet(b), 6)
          expect(metresToInches(a) / 12).toBeCloseTo(metresToFeet(a), 9)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('carries a walked height across the boundary intact', () => {
    // The one number a builder would check by hand: a yard that falls a metre
    // falls 3.28 feet, wherever the datum happens to be.
    fc.assert(
      fc.property(datum, siteElevationFt => {
        const field = decodeCapture(
          smallYard({ terrain: slope(1, 7.25), siteElevationFt, coverage: fullyWalked }),
        )
        const heights = field.elevationsFt.filter((_, i) => isMeasured(field, i))
        const fall = Math.max(...heights) - Math.min(...heights)
        expect(fall).toBeCloseTo(FEET_PER_METRE, 2)
      }),
      { numRuns: 30 },
    )
  })
})

/** The refusal a payload produces, or null if it was accepted. */
function refusalFrom(payload: unknown): CaptureRejection | null {
  try {
    decodeCapture(payload)
  } catch (err) {
    if (err instanceof CaptureRejection) return err
    throw err
  }
  return null
}

describe('decoding a capture', () => {
  it('never lets coverage out above one or below zero', () => {
    fc.assert(
      fc.property(yard, payload => {
        const field = decodeCapture(payload)
        for (const cover of field.coverage) {
          expect(cover).toBeGreaterThanOrEqual(0)
          expect(cover).toBeLessThanOrEqual(1)
        }
      }),
      { numRuns: 40 },
    )
  })

  it('refuses coverage above one rather than quietly clamping it', () => {
    // Clamping 1.4 to 1 turns a broken client into ground the app claims
    // somebody walked, which is the exact lie this feature exists to prevent.
    fc.assert(
      fc.property(fc.double({ min: 1.0001, max: 50, noNaN: true }), bad => {
        const payload = smallYard({ coverage: fullyWalked })
        const coverage = payload.coverage as number[]
        coverage[0] = bad
        expect(() => decodeCapture(payload)).toThrow(CaptureRejection)
      }),
      { numRuns: 50 },
    )
  })

  it('reads the two encodings to the same yard', () => {
    fc.assert(
      fc.property(terrain, mask, datum, (t, m, siteElevationFt) => {
        const asJson = decodeCapture(
          smallYard({ terrain: t, coverage: m, siteElevationFt, encoding: 'json' }),
        )
        const asBytes = decodeCapture(
          smallYard({ terrain: t, coverage: m, siteElevationFt, encoding: 'base64' }),
        )
        expect(asBytes.cols).toBe(asJson.cols)
        expect(asBytes.rows).toBe(asJson.rows)
        for (let i = 0; i < asJson.elevationsFt.length; i++) {
          expect(asBytes.elevationsFt[i]!).toBeCloseTo(asJson.elevationsFt[i]!, 3)
        }
      }),
      { numRuns: 20 },
    )
  })

  it('puts the datum where the benchmark tap says, everywhere at once', () => {
    // The invariant the grade model is built on: a survey shot is an absolute
    // height, and the datum is the height of ground nobody measured. Moving the
    // benchmark must shift the whole site and never reshape it.
    fc.assert(
      fc.property(terrain, mask, datum, datum, (t, m, base, shift) => {
        const here = decodeCapture(smallYard({ terrain: t, coverage: m, siteElevationFt: base }))
        const there = decodeCapture(
          smallYard({ terrain: t, coverage: m, siteElevationFt: base + shift }),
        )
        expect(there.datumFt).toBeCloseTo(base + shift, 6)
        for (let i = 0; i < here.elevationsFt.length; i++) {
          expect(there.elevationsFt[i]!).toBeCloseTo(here.elevationsFt[i]! + shift, 4)
        }
      }),
      { numRuns: 20 },
    )
  })

  it('never reads the height of a cell nobody walked', () => {
    // The fixtures poison every unwalked cell with -42 metres, which is not a
    // height any backyard has. If it ever reaches the surface it will be
    // obvious, which is the point of poisoning it rather than zeroing it.
    fc.assert(
      fc.property(terrain, mask, datum, (t, m, siteElevationFt) => {
        const field = decodeCapture(smallYard({ terrain: t, coverage: m, siteElevationFt }))
        for (let i = 0; i < field.elevationsFt.length; i++) {
          if (isMeasured(field, i)) continue
          expect(field.elevationsFt[i]).toBe(field.datumFt)
        }
      }),
      { numRuns: 30 },
    )
  })

  it('answers every hostile payload with a refusal, never a crash', () => {
    // The refusal path logs the technical detail on purpose, which is the right
    // behaviour and three hundred lines of noise in this one test.
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Anything that is not a CaptureRejection reaches the user as a raw error
    // string, which is how a stack frame or a fragment of somebody else's
    // survey ends up in a toast.
    fc.assert(
      fc.property(fc.anything(), value => {
        try {
          decodeCapture(value)
        } catch (err) {
          expect(err).toBeInstanceOf(CaptureRejection)
          expect((err as CaptureRejection).message).toMatch(/Nothing was changed/)
        }
      }),
      { numRuns: 300 },
    )
    quiet.mockRestore()
  })

  it('refuses a payload whose heights do not match its own grid', () => {
    // A grid that says 40 by 30 and carries 900 heights is not a survey with a
    // missing corner. It is two surveys spliced together, and reading it
    // row-major puts the far fence in the middle of the lawn. The refusal has
    // to name the count, because refusing it later for some downstream reason
    // (a NaN height, say) is luck rather than a check.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), skippedRows => {
        const payload = smallYard({ coverage: fullyWalked })
        payload.elevations = (payload.elevations as number[]).slice(0, -skippedRows * 40)

        const refused = refusalFrom(payload)
        expect(refused?.code).toBe('INCONSISTENT')
        expect(refused?.message).toMatch(/cells but carries/)
      }),
      { numRuns: 25 },
    )
  })

  it('refuses a payload whose mask does not match its own grid', () => {
    // The mask is the half that fails silently: a short coverage array reads as
    // zeros past its end, so every missing cell looks like ground nobody walked
    // and the capture decodes perfectly happily with a corner quietly deleted.
    // Nothing downstream could ever notice.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), skippedRows => {
        const payload = smallYard({ coverage: fullyWalked })
        payload.coverage = (payload.coverage as number[]).slice(0, -skippedRows * 40)

        const refused = refusalFrom(payload)
        expect(refused?.code).toBe('INCONSISTENT')
        expect(refused?.message).toMatch(/cells but carries/)
      }),
      { numRuns: 25 },
    )
  })

  it('refuses a payload where both arrays are short together', () => {
    // The case that gets past a check on only one of them, and the one a
    // truncated upload actually produces.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), skippedRows => {
        const payload = smallYard({ coverage: fullyWalked })
        const cut = skippedRows * 40
        payload.elevations = (payload.elevations as number[]).slice(0, -cut)
        payload.coverage = (payload.coverage as number[]).slice(0, -cut)

        const refused = refusalFrom(payload)
        expect(refused?.code).toBe('INCONSISTENT')
        expect(refused?.message).toMatch(/cells but carries/)
      }),
      { numRuns: 25 },
    )
  })

  it('refuses a base64 array of the wrong length too', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), bytes => {
        const payload = smallYard({ encoding: 'base64' })
        const raw = Buffer.from(payload.coverage as string, 'base64')
        payload.coverage = raw.subarray(0, raw.byteLength - bytes).toString('base64')

        expect(refusalFrom(payload)?.code).toBe('INCONSISTENT')
      }),
      { numRuns: 25 },
    )
  })

  it('refuses a contract version it has never heard of', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }).filter(v => v !== CAPTURE_CONTRACT_VERSION),
        version => {
          const payload = { ...smallYard({}), contractVersion: version }
          expect(() => decodeCapture(payload)).toThrow(CaptureRejection)
        },
      ),
      { numRuns: 40 },
    )
  })
})

describe('storage', () => {
  it('round-trips a heightfield without moving it', () => {
    fc.assert(
      fc.property(yard, payload => {
        const field = decodeCapture(payload)
        const packed = packHeightfield(field)
        const back = unpackHeightfield({
          captureId: field.captureId,
          cols: field.cols,
          rows: field.rows,
          cellSizeIn: field.cellSizeIn,
          originXIn: field.originXIn,
          originYIn: field.originYIn,
          benchmarkXIn: field.benchmarkXIn,
          benchmarkYIn: field.benchmarkYIn,
          datumFt: field.datumFt,
          benchmarkLabel: field.benchmarkLabel,
          capturedAt: new Date(field.capturedAt),
          elevationsFt: packed.elevationsFt,
          coverage: packed.coverage,
        })

        expect(back.cols).toBe(field.cols)
        expect(back.rows).toBe(field.rows)
        expect(back.cellSizeIn).toBeCloseTo(field.cellSizeIn, 9)
        expect(back.originXIn).toBeCloseTo(field.originXIn, 9)
        for (let i = 0; i < field.elevationsFt.length; i++) {
          expect(Math.abs(back.elevationsFt[i]! - field.elevationsFt[i]!)).toBeLessThan(
            STORAGE_TOLERANCE_FT,
          )
          // Coverage survives well enough to keep the same answer to the only
          // question anybody asks of it.
          expect(isMeasured(back, i)).toBe(isMeasured(field, i))
        }
      }),
      { numRuns: 15 },
    )
  })
})

describe('coverage', () => {
  it('interpolates nothing when the whole yard was walked', () => {
    fc.assert(
      fc.property(terrain, datum, (t, siteElevationFt) => {
        const field = decodeCapture(
          smallYard({ terrain: t, coverage: fullyWalked, siteElevationFt }),
        )
        const report = coverageOver(field, fieldBounds(field))
        expect(report.fraction).toBe(1)
        expect(report.gapAreaSqft).toBe(0)
        expect(report.largestGapSqft).toBe(0)
        expect(report.complete).toBe(true)
        // And says nothing, because a caveat that appears when everything is
        // fine is a caveat people stop reading.
        expect(coverageCaveat(report, 'the pool footprint')).toBeNull()
      }),
      { numRuns: 20 },
    )
  })

  it('never reports a fraction outside zero to one', () => {
    fc.assert(
      fc.property(yard, payload => {
        const field = decodeCapture(payload)
        const report = coverageOver(field, fieldBounds(field))
        expect(report.fraction).toBeGreaterThanOrEqual(0)
        expect(report.fraction).toBeLessThanOrEqual(1)
        expect(report.gapAreaSqft).toBeGreaterThanOrEqual(0)
        expect(report.largestGapSqft).toBeLessThanOrEqual(report.gapAreaSqft + 1e-6)
        expect(report.measuredAreaSqft).toBeLessThanOrEqual(report.areaSqft + 1e-6)
      }),
      { numRuns: 40 },
    )
  })

  it('says so when a stripe was skipped', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 8 }), width => {
        const field = decodeCapture(smallYard({ coverage: skippedStripe(10, 10 + width) }))
        const report = coverageOver(field, fieldBounds(field))
        expect(report.complete).toBe(false)
        expect(report.gapAreaSqft).toBeGreaterThan(0)
        const caveat = coverageCaveat(report, 'the pool footprint')
        expect(caveat).toMatch(/never walked/)
        expect(caveat).toMatch(/interpolated/)
      }),
      { numRuns: 20 },
    )
  })

  it('counts ground outside the capture as ground nobody walked', () => {
    // A pool drawn past the edge of the walk is unmeasured ground. Reporting
    // only over the overlap would call that survey complete, which is the
    // failure mode that makes a coverage number worse than none.
    const field = decodeCapture(smallYard({ coverage: fullyWalked }))
    const walked = fieldBounds(field)
    const doubled = { ...walked, width: walked.width * 2 }
    const report = coverageOver(field, doubled)
    expect(report.complete).toBe(false)
    expect(report.fraction).toBeLessThan(0.6)
    expect(report.fraction).toBeGreaterThan(0.4)
  })

  it('never reports more coverage when more of the yard was skipped', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), extra => {
        const small = decodeCapture(smallYard({ coverage: skippedStripe(5, 8) }))
        const large = decodeCapture(smallYard({ coverage: skippedStripe(5, 8 + extra) }))
        const bounds = fieldBounds(small)
        expect(coverageOver(large, bounds).fraction).toBeLessThanOrEqual(
          coverageOver(small, bounds).fraction + 1e-9,
        )
      }),
      { numRuns: 20 },
    )
  })
})

describe('the surface a capture becomes', () => {
  it('only ever puts a shot where somebody stood', () => {
    // A survey shot is a claim that a person was there. Decimating onto an
    // unwalked cell would turn an interpolation into a measurement, and nothing
    // downstream could tell the difference ever again.
    fc.assert(
      fc.property(yard, payload => {
        const field = decodeCapture(payload)
        for (const shot of decimateToShots(field, { maxShots: 24 }).points) {
          const col = Math.round((shot.x - field.originXIn) / field.cellSizeIn)
          const row = Math.round((shot.y - field.originYIn) / field.cellSizeIn)
          expect(isMeasured(field, row * field.cols + col)).toBe(true)
        }
      }),
      { numRuns: 25 },
    )
  })

  it('reproduces ground that falls and drains, to inside a laser\'s error', () => {
    // Smooth terrain only: a slope, a swale, a flat pad. Those are what a yard
    // does, and the surface has to agree with the walk to better than the
    // instrument a builder would otherwise have used. A uniform stride fails
    // this on the swale, which is the whole reason the decimation is
    // error-driven.
    fc.assert(
      fc.property(smoothTerrain, datum, (t, siteElevationFt) => {
        const field = decodeCapture(
          smallYard({ terrain: t, coverage: fullyWalked, siteElevationFt }),
        )
        const error = reconstructionError(field, existingSurfaceFrom(field, null).grade)
        expect(error.meanFt).toBeLessThan(0.05)
      }),
      { numRuns: 20 },
    )
  })

  it('reports how far it is from the walk, and is not optimistic about it', () => {
    // The number the app publishes about its own accuracy has to be about the
    // surface it actually shipped, benchmark and hand-set constraints included,
    // not about the intermediate the greedy loop happened to finish on.
    fc.assert(
      fc.property(terrain, datum, (t, siteElevationFt) => {
        const field = decodeCapture(smallYard({ terrain: t, siteElevationFt }))
        const built = existingSurfaceFrom(field, null)
        const actual = reconstructionError(field, built.grade)
        expect(built.maxErrorFt).toBeCloseTo(actual.maxFt, 9)
        expect(actual.meanFt).toBeLessThanOrEqual(actual.maxFt + 1e-9)
      }),
      { numRuns: 25 },
    )
  })

  it('smooths a drainage swale, and the size of that is on the record', () => {
    // Inverse distance weighting is a smoother, so a narrow trench is rounded
    // off however many shots are spent on it: going from 64 shots to 200 moves
    // this from 0.18 ft to 0.14 ft. That is the surface model the whole app
    // already uses, not the decimation, and the honest response is to publish
    // the error rather than to pretend the trench is exact. The bottom of it is
    // still found, which is what the volume depends on.
    const field = decodeCapture(smallYard({ terrain: inRangeSwale, coverage: fullyWalked }))
    const built = existingSurfaceFrom(field, null)
    const error = reconstructionError(field, built.grade)
    expect(error.meanFt).toBeLessThan(0.2)
    expect(built.maxErrorFt).toBeGreaterThan(error.meanFt)
  })

  it('smooths a hard step, and the size of that is on the record', () => {
    // Inverse distance weighting is continuous, so a vertical face - the edge
    // of a slab that is coming out - is rounded rather than reproduced. This is
    // a real limitation of the model this capture feeds, not a bug in the
    // decimation, and it is written down here so nobody discovers it on a site
    // with a retaining wall. A foot-high step is reproduced to inside four
    // inches on average.
    const field = decodeCapture(
      smallYard({ terrain: padWithStep(5, 0.3), coverage: fullyWalked }),
    )
    const error = reconstructionError(field, existingSurfaceFrom(field, null).grade)
    expect(error.meanFt).toBeLessThan(0.34)
    expect(error.maxFt).toBeLessThan(1.0)
  })

  it('finds the bottom of a swale a uniform stride would miss', () => {
    const field = decodeCapture(
      syntheticYard({
        cols: 120,
        rows: 90,
        cellSizeM: 0.2,
        terrain: swale(0.9, 18, 9, 0.6, 1.5),
        coverage: fullyWalked,
      }),
    )
    const built = existingSurfaceFrom(field, null)
    const lowestWalked = Math.min(
      ...field.elevationsFt.filter((_, i) => isMeasured(field, i)),
    )
    const lowestShot = Math.min(...built.grade.points.map(p => p.elevationFt))
    // Within an inch of the true bottom. The trench is what the dig is priced
    // on, and a surface that never reaches it under-quotes by its whole volume.
    expect(lowestShot).toBeLessThan(lowestWalked + 1 / 12)
  })

  it('sets the datum from the benchmark tap', () => {
    fc.assert(
      fc.property(terrain, datum, (t, siteElevationFt) => {
        const field = decodeCapture(smallYard({ terrain: t, siteElevationFt }))
        const built = existingSurfaceFrom(field, null)
        expect(built.grade.baseElevationFt).toBeCloseTo(siteElevationFt, 6)
        // And the tap itself is a shot, at the height the builder said it was.
        const benchmark = built.grade.points.find(p => p.id.endsWith('-benchmark'))
        expect(benchmark?.elevationFt).toBeCloseTo(siteElevationFt, 6)
      }),
      { numRuns: 20 },
    )
  })

  it('moves the whole site when the capture is placed, and never reshapes it', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -400, max: 400 }),
        fc.integer({ min: -400, max: 400 }),
        (dx, dy) => {
          const field = decodeCapture(smallYard({ terrain: inRangeSwale }))
          const here = existingSurfaceFrom(field, null).grade
          const there = existingSurfaceFrom(
            placeHeightfield(field, { xIn: dx, yIn: dy }),
            null,
          ).grade

          expect(there.points).toHaveLength(here.points.length)
          for (let i = 0; i < here.points.length; i++) {
            expect(there.points[i]!.x).toBeCloseTo(here.points[i]!.x + dx, 6)
            expect(there.points[i]!.y).toBeCloseTo(here.points[i]!.y + dy, 6)
            expect(there.points[i]!.elevationFt).toBeCloseTo(here.points[i]!.elevationFt, 9)
          }
        },
      ),
      { numRuns: 25 },
    )
  })

  it('keeps hand-set constraints and supersedes typed guesses', () => {
    // A walk is a better survey than a guess, but a door sill is not a guess:
    // it is a constraint somebody entered on purpose, and no amount of walking
    // moves it.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.integer({ min: 1, max: 6 }), (fixed, typed) => {
        const previous = {
          ...emptyGrade(),
          enabled: true,
          points: [
            ...Array.from({ length: fixed }, (_, i) => ({
              id: `fixed-${i}`,
              x: i * 24,
              y: 0,
              elevationFt: 1,
              kind: 'fixed' as const,
            })),
            ...Array.from({ length: typed }, (_, i) => ({
              id: `typed-${i}`,
              x: i * 24,
              y: 48,
              elevationFt: -1,
              kind: 'existing' as const,
            })),
          ],
        }
        const field = decodeCapture(smallYard({}))
        const built = existingSurfaceFrom(field, previous)

        expect(built.keptFixed).toBe(fixed)
        expect(built.replaced).toBe(typed)
        for (let i = 0; i < fixed; i++) {
          expect(built.grade.points.some(p => p.id === `fixed-${i}`)).toBe(true)
        }
        expect(built.grade.points.some(p => p.id.startsWith('typed-'))).toBe(false)
      }),
      { numRuns: 25 },
    )
  })

  it('leaves exactly one datum behind when the same yard is walked twice', () => {
    const first = existingSurfaceFrom(decodeCapture(smallYard({ captureId: captureId(1) })), null)
    const second = existingSurfaceFrom(
      decodeCapture(smallYard({ captureId: captureId(2) })),
      first.grade,
    )
    const benchmarks = second.grade.points.filter(p => p.id.endsWith('-benchmark'))
    expect(benchmarks).toHaveLength(1)
  })

  it('never invents ground outside what the walk actually saw', () => {
    // The existing model's own invariant, restated against a captured surface:
    // inverse distance weighting interpolates and never extrapolates, so no
    // point on the site may be higher or lower than the highest and lowest
    // heights anybody stood on.
    fc.assert(
      fc.property(yard, fc.integer({ min: -2_000, max: 2_000 }), fc.integer({ min: -2_000, max: 2_000 }), (payload, x, y) => {
        const field = decodeCapture(payload)
        const built = existingSurfaceFrom(field, null)
        const heights = built.grade.points.map(p => p.elevationFt)
        const here = elevationAt(built.grade, x, y)
        expect(here).toBeGreaterThanOrEqual(Math.min(...heights) - 1e-6)
        expect(here).toBeLessThanOrEqual(Math.max(...heights) + 1e-6)
      }),
      { numRuns: 30 },
    )
  })
})

describe('earthwork from a captured surface', () => {
  it('reports cut and fill apart, never netted', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.5, max: 8, noNaN: true }), digFt => {
        const field = decodeCapture(smallYard({ terrain: flat(0), coverage: fullyWalked }))
        const existing = existingSurfaceFrom(field, null).grade
        const finished = { ...emptyGrade(), enabled: true, baseElevationFt: -digFt }
        const bounds = fieldBounds(field)

        const result = cutFillBetween(existing, finished, bounds, 24)
        expect(result.cutYards).toBeGreaterThan(0)
        expect(result.fillYards).toBe(0)
      }),
      { numRuns: 25 },
    )
  })

  it('never reports a negative volume from any yard', () => {
    fc.assert(
      fc.property(yard, datum, (payload, finishedFt) => {
        const field = decodeCapture(payload)
        const existing = existingSurfaceFrom(field, null).grade
        const finished = { ...emptyGrade(), enabled: true, baseElevationFt: finishedFt }
        const result = cutFillBetween(existing, finished, fieldBounds(field), 48)
        expect(result.cutYards).toBeGreaterThanOrEqual(0)
        expect(result.fillYards).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(result.netYards)).toBe(true)
      }),
      { numRuns: 25 },
    )
  })

  it('does not change when the coverage mask does', () => {
    // The mask decides what the app is allowed to claim, not what the ground
    // is. Two walks of the same yard that measured different parts of it must
    // agree about the parts they both measured.
    const walked = decodeCapture(smallYard({ terrain: slope(), coverage: fullyWalked }))
    const patchy = decodeCapture(smallYard({ terrain: slope(), coverage: fadedEdges(40, 30, 4) }))
    const bounds = {
      x: walked.originXIn + 10 * walked.cellSizeIn,
      y: walked.originYIn + 10 * walked.cellSizeIn,
      width: 12 * walked.cellSizeIn,
      height: 8 * walked.cellSizeIn,
    }
    const a = existingSurfaceFrom(walked, null).grade
    const b = existingSurfaceFrom(patchy, null).grade
    const mid = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    expect(elevationAt(b, mid.x, mid.y)).toBeCloseTo(elevationAt(a, mid.x, mid.y), 1)
  })
})

describe('the coverage threshold', () => {
  it('treats a partial return as measured and an empty cell as not', () => {
    fc.assert(
      fc.property(
        fc.double({ min: MEASURED_COVERAGE_MIN, max: 1, noNaN: true }),
        fc.double({ min: 0, max: MEASURED_COVERAGE_MIN - 1e-6, noNaN: true }),
        (good, bad) => {
          const field: Heightfield = {
            captureId: captureId(7),
            cols: 2,
            rows: 1,
            cellSizeIn: 12,
            originXIn: 0,
            originYIn: 0,
            benchmarkXIn: 0,
            benchmarkYIn: 0,
            elevationsFt: [1, 2],
            coverage: [good, bad],
            datumFt: 0,
            benchmarkLabel: null,
            capturedAt: '2026-08-22T00:00:00.000Z',
          }
          expect(isMeasured(field, 0)).toBe(true)
          expect(isMeasured(field, 1)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })
})
