import { describe, it, expect } from 'vitest'
import {
  autocorrelation,
  columnProjection,
  combScore,
  detectGrid,
  estimatePhase,
  inkField,
} from '@/modules/imports/precision/grid'
import { makeGridImage, poolStroke } from './synthetic'

/** Relative pitch error, the number that actually matters downstream. */
function pitchError(measured: number, truth: number): number {
  return Math.abs(measured - truth) / truth
}

describe('inkField', () => {
  it('flattens a pure lighting gradient to nothing', () => {
    const width = 64
    const height = 64
    const data = new Uint8ClampedArray(width * height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) data[y * width + x] = 40 + Math.round((x / width) * 180)
    }
    const ink = inkField(data, width, height, 6, 0.92)
    let peak = 0
    for (let i = 0; i < ink.length; i++) peak = Math.max(peak, ink[i]!)
    // A ramp has no local structure, so nothing survives the local mean.
    expect(peak).toBeLessThan(4)
  })

  it('keeps a dark line and clips a much darker blot to the same level', () => {
    const width = 80
    const height = 40
    const data = new Uint8ClampedArray(width * height).fill(240)
    for (let y = 0; y < height; y++) data[y * width + 10] = 200
    for (let y = 18; y < 22; y++) {
      for (let x = 40; x < 60; x++) data[y * width + x] = 5
    }
    const ink = inkField(data, width, height, 8, 0.9)
    const lineInk = ink[20 * width + 10]!
    const blotInk = ink[20 * width + 50]!
    expect(lineInk).toBeGreaterThan(0)
    expect(blotInk).toBeCloseTo(lineInk, 5)
  })
})

describe('autocorrelation and combScore', () => {
  it('peaks at the period of a synthetic comb', () => {
    const signal = new Float64Array(600)
    for (let i = 0; i < signal.length; i++) signal[i] = i % 25 === 0 ? 1 : 0
    const r = autocorrelation(signal, 120)
    expect(r[25]!).toBeGreaterThan(0.9)
    expect(r[50]!).toBeGreaterThan(0.9)
    expect(r[12]!).toBeLessThan(0.1)
  })

  it('scores the fundamental above its own second harmonic', () => {
    const signal = new Float64Array(600)
    for (let i = 0; i < signal.length; i++) signal[i] = i % 25 === 0 ? 1 : 0
    const r = autocorrelation(signal, 150)
    expect(combScore(r, 25)).toBeGreaterThan(combScore(r, 50))
  })

  it('is flat for a constant signal', () => {
    const signal = new Float64Array(200).fill(3)
    const r = autocorrelation(signal, 50)
    expect(r[10]).toBe(0)
  })
})

describe('estimatePhase', () => {
  it('recovers a known offset', () => {
    const period = 16
    const offset = 5
    const signal = new Float64Array(320)
    for (let i = 0; i < signal.length; i++) {
      signal[i] = Math.cos((2 * Math.PI * (i - offset)) / period)
    }
    expect(estimatePhase(signal, period)).toBeCloseTo(offset, 3)
  })
})

describe('detectGrid on clean synthetic graph paper', () => {
  const pitches = [12, 16, 20, 25, 32, 48]

  for (const pitch of pitches) {
    it(`recovers a ${pitch}px pitch to better than 1%`, () => {
      const image = makeGridImage({ pitchPx: pitch, width: 480, height: 360 })
      const detection = detectGrid(image.data, image.width, image.height)
      expect(detection).not.toBeNull()
      expect(pitchError(detection!.pitchPx, pitch)).toBeLessThan(0.01)
      expect(detection!.confidence).toBeGreaterThan(0.6)
    })
  }

  it('recovers the grid origin offset', () => {
    const image = makeGridImage({ pitchPx: 20, originX: 7, originY: 11 })
    const detection = detectGrid(image.data, image.width, image.height)
    expect(detection).not.toBeNull()
    // Offsets are reported modulo the pitch, so compare on the circle.
    const wrapped = (value: number, period: number) =>
      Math.min(Math.abs(value), period - Math.abs(value))
    expect(wrapped(detection!.originOffsetPx.x - 7, 20)).toBeLessThan(1)
    expect(wrapped(detection!.originOffsetPx.y - 11, 20)).toBeLessThan(1)
  })
})

describe('detectGrid under hostile conditions', () => {
  it('survives sensor noise', () => {
    const image = makeGridImage({ pitchPx: 20, noiseAmp: 18, seed: 7 })
    const detection = detectGrid(image.data, image.width, image.height)
    expect(detection).not.toBeNull()
    expect(pitchError(detection!.pitchPx, 20)).toBeLessThan(0.02)
  })

  it('survives a drawing four times darker than the rules', () => {
    const image = makeGridImage({
      pitchPx: 20,
      gridDepth: 40,
      strokes: [poolStroke(480, 360, 200)],
      noiseAmp: 8,
      seed: 3,
    })
    const detection = detectGrid(image.data, image.width, image.height)
    expect(detection).not.toBeNull()
    expect(pitchError(detection!.pitchPx, 20)).toBeLessThan(0.02)
  })

  it('survives an uneven lighting gradient', () => {
    const image = makeGridImage({ pitchPx: 20, gradientAmp: 150, noiseAmp: 6, seed: 11 })
    const detection = detectGrid(image.data, image.width, image.height)
    expect(detection).not.toBeNull()
    expect(pitchError(detection!.pitchPx, 20)).toBeLessThan(0.02)
  })

  for (const rotation of [0.75, 1.5, 3]) {
    it(`survives ${rotation} degrees of rotation`, () => {
      const image = makeGridImage({ pitchPx: 20, rotationDeg: rotation, noiseAmp: 6, seed: 5 })
      const detection = detectGrid(image.data, image.width, image.height)
      expect(detection).not.toBeNull()
      expect(pitchError(detection!.pitchPx, 20)).toBeLessThan(0.03)
    })
  }

  it('survives a grid covering only the middle of the frame', () => {
    const image = makeGridImage({
      pitchPx: 20,
      coverage: { x0: 0.2, y0: 0.15, x1: 0.85, y1: 0.9 },
      noiseAmp: 6,
      seed: 13,
    })
    const detection = detectGrid(image.data, image.width, image.height)
    expect(detection).not.toBeNull()
    expect(pitchError(detection!.pitchPx, 20)).toBeLessThan(0.03)
  })

  it('handles everything hostile at once', () => {
    const image = makeGridImage({
      pitchPx: 24,
      rotationDeg: 2,
      gradientAmp: 120,
      noiseAmp: 14,
      gridDepth: 38,
      strokes: [poolStroke(480, 360, 190)],
      coverage: { x0: 0.05, y0: 0.05, x1: 0.95, y1: 0.95 },
      seed: 21,
    })
    const detection = detectGrid(image.data, image.width, image.height)
    expect(detection).not.toBeNull()
    expect(pitchError(detection!.pitchPx, 24)).toBeLessThan(0.04)
  })
})

describe('detectGrid refuses rather than guesses', () => {
  it('returns null on blank paper', () => {
    const image = makeGridImage({ gridDepth: 0, noiseAmp: 4, seed: 2 })
    expect(detectGrid(image.data, image.width, image.height)).toBeNull()
  })

  it('returns null on pure noise', () => {
    const width = 320
    const height = 240
    const data = new Uint8ClampedArray(width * height)
    let seed = 99
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = seed % 256
    }
    expect(detectGrid(data, width, height)).toBeNull()
  })

  it('returns null when a drawing is present but no grid is', () => {
    const image = makeGridImage({ gridDepth: 0, strokes: [poolStroke(480, 360, 200)], noiseAmp: 5 })
    expect(detectGrid(image.data, image.width, image.height)).toBeNull()
  })

  it('returns null when the two axes disagree about the pitch', () => {
    // Ruled paper: horizontal rules every 20px, no vertical rules at all, plus
    // a second periodicity in x that does not match. Nothing here is a grid.
    const width = 400
    const height = 320
    const data = new Uint8ClampedArray(width * height).fill(244)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y % 20 === 0) data[y * width + x] = 200
        if (x % 31 === 0) data[y * width + x] = 200
      }
    }
    expect(detectGrid(data, width, height)).toBeNull()
  })

  it('rejects degenerate inputs instead of throwing', () => {
    expect(detectGrid(new Uint8ClampedArray(0), 0, 0)).toBeNull()
    expect(detectGrid(new Uint8ClampedArray(16), 4, 4)).toBeNull()
    expect(detectGrid(new Uint8ClampedArray(100), 40, 40)).toBeNull()
    expect(detectGrid(new Uint8ClampedArray(64), 8.5, 8)).toBeNull()
  })
})

describe('detectGrid measured accuracy over a sweep', () => {
  // The claim this feature rests on is "no wrong pitches, ever". A sweep across
  // pitch, rotation and seed, all with noise, a lighting gradient and a heavy
  // drawing on top, is the cheapest way to keep that claim honest: a refusal is
  // acceptable, a confidently wrong number is not.
  it('never reports a wrong pitch, and resolves the large majority', () => {
    const pitches = [10, 12, 16, 20, 24, 25, 32, 40]
    const rotations = [0, 1.5, 3]
    const seeds = [1, 2]

    const errors: number[] = []
    let refusals = 0
    let cases = 0

    for (const pitchPx of pitches) {
      for (const rotationDeg of rotations) {
        for (const seed of seeds) {
          cases++
          const image = makeGridImage({
            pitchPx,
            rotationDeg,
            seed,
            noiseAmp: 12,
            gradientAmp: 110,
            gridDepth: 40,
            strokes: [poolStroke(480, 360, 195)],
          })
          const detection = detectGrid(image.data, image.width, image.height)
          if (!detection) {
            refusals++
            continue
          }
          errors.push(pitchError(detection.pitchPx, pitchPx))
        }
      }
    }

    const worst = errors.reduce((max, e) => Math.max(max, e), 0)
    expect(worst).toBeLessThan(0.01)
    expect(refusals / cases).toBeLessThan(0.15)
  })
})

describe('projections', () => {
  it('sums ink down each column over the requested band only', () => {
    const width = 4
    const height = 4
    const ink = new Float32Array(width * height)
    ink[0 * width + 1] = 5
    ink[2 * width + 1] = 7
    const top = columnProjection(ink, width, 0, 2)
    const bottom = columnProjection(ink, width, 2, 4)
    expect(Array.from(top)).toEqual([0, 5, 0, 0])
    expect(Array.from(bottom)).toEqual([0, 7, 0, 0])
  })
})
