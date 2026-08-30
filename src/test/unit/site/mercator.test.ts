// Property tests for the pure geographic math. The projection and the ground
// resolution are the two numbers everything downstream trusts: a backdrop at
// the wrong scale is a pool priced off the wrong yard.

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  imageSizeInches,
  inchesPerPixel,
  metersPerPixel,
  projectToInches,
  unprojectFromInches,
} from '@/modules/site/geo/mercator'

const EARTH_RADIUS_M = 6378137
const METERS_PER_INCH = 0.0254

// Origins away from the poles, per the schema's own bounds and then some.
const originArb = fc.record({
  lat: fc.double({ min: -60, max: 60, noNaN: true }),
  lng: fc.double({ min: -179, max: 179, noNaN: true }),
})

// Offsets up to 1000 ft in editor inches, both axes.
const offsetArb = fc.record({
  xInches: fc.double({ min: -12_000, max: 12_000, noNaN: true }),
  yInches: fc.double({ min: -12_000, max: 12_000, noNaN: true }),
})

const zoomArb = fc.integer({ min: 15, max: 21 })

describe('projectToInches / unprojectFromInches', () => {
  it('roundtrips inches -> lat/lng -> inches within a hundredth of an inch', () => {
    fc.assert(
      fc.property(originArb, offsetArb, (origin, offset) => {
        const point = unprojectFromInches(origin, offset)
        const back = projectToInches(origin, point)
        expect(back.xInches).toBeCloseTo(offset.xInches, 2)
        expect(back.yInches).toBeCloseTo(offset.yInches, 2)
      }),
    )
  })

  it('roundtrips lat/lng -> inches -> lat/lng within a survey-invisible error', () => {
    fc.assert(
      fc.property(originArb, offsetArb, (origin, offset) => {
        const point = unprojectFromInches(origin, offset)
        const inches = projectToInches(origin, point)
        const back = unprojectFromInches(origin, inches)
        // 1e-8 degrees is about a millimetre of ground.
        expect(back.lat).toBeCloseTo(point.lat, 8)
        expect(back.lng).toBeCloseTo(point.lng, 8)
      }),
    )
  })

  it('projects the origin to (0, 0)', () => {
    fc.assert(
      fc.property(originArb, origin => {
        const projected = projectToInches(origin, origin)
        // Math.abs, because -0 is a legitimate result of projecting southM = -0.
        expect(Math.abs(projected.xInches)).toBe(0)
        expect(Math.abs(projected.yInches)).toBe(0)
      }),
    )
  })

  it('maps north to negative y and east to positive x', () => {
    fc.assert(
      fc.property(originArb, origin => {
        const north = projectToInches(origin, { lat: origin.lat + 0.0005, lng: origin.lng })
        const east = projectToInches(origin, { lat: origin.lat, lng: origin.lng + 0.0005 })
        expect(north.yInches).toBeLessThan(0)
        expect(east.xInches).toBeGreaterThan(0)
      }),
    )
  })
})

describe('metersPerPixel', () => {
  it('halves with every zoom step', () => {
    fc.assert(
      fc.property(originArb, fc.integer({ min: 15, max: 20 }), (origin, zoom) => {
        const here = metersPerPixel(origin.lat, zoom)
        const closer = metersPerPixel(origin.lat, zoom + 1)
        expect(closer).toBeCloseTo(here / 2, 10)
      }),
    )
  })

  it('matches the published Web Mercator ground resolution at the equator', () => {
    // 156543.03392 m/px at zoom 0, scale 1, the constant every GIS text quotes.
    expect(metersPerPixel(0, 0, 1)).toBeCloseTo(156543.03392, 4)
  })
})

describe('inchesPerPixel', () => {
  it('is positive and strictly decreasing in zoom', () => {
    fc.assert(
      fc.property(originArb, zoomArb, (origin, zoom) => {
        const here = inchesPerPixel(origin.lat, zoom)
        expect(here).toBeGreaterThan(0)
        if (zoom < 21) {
          expect(inchesPerPixel(origin.lat, zoom + 1)).toBeLessThan(here)
        }
      }),
    )
  })
})

describe('imageSizeInches', () => {
  it('matches the hand-computed ground size at lat 0, zoom 20, 640px', () => {
    // scale=1 resolution for the requested size: with scale=2 the bitmap has
    // twice the pixels over the same ground.
    const groundMetersPerPx = (2 * Math.PI * EARTH_RADIUS_M) / 256 / 2 ** 20
    const expected = (groundMetersPerPx / METERS_PER_INCH) * 640
    const { widthInches, heightInches } = imageSizeInches(0, 20, 640, 640)
    expect(widthInches).toBeCloseTo(expected, 6)
    expect(heightInches).toBeCloseTo(expected, 6)
    // Sanity anchor: roughly 313 ft across a suburban lot photo.
    expect(widthInches / 12).toBeGreaterThan(310)
    expect(widthInches / 12).toBeLessThan(315)
  })

  it('scales linearly with the requested pixel dimensions', () => {
    fc.assert(
      fc.property(
        originArb,
        zoomArb,
        fc.integer({ min: 64, max: 320 }),
        (origin, zoom, px) => {
          const single = imageSizeInches(origin.lat, zoom, px, px)
          const double = imageSizeInches(origin.lat, zoom, px * 2, px * 2)
          expect(double.widthInches).toBeCloseTo(single.widthInches * 2, 6)
          expect(double.heightInches).toBeCloseTo(single.heightInches * 2, 6)
        },
      ),
    )
  })
})
