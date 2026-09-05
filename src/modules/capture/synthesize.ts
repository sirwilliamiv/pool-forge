// A fabricated site walk, so the whole capture pipeline can be exercised
// without an iPhone.
//
// The server half of walked-site capture (decode -> place -> existing-grade
// surface -> coverage -> earthwork pricing -> terrain render) is built and
// tested, but the only thing that ever fed it was the phone, so on the web it
// was invisible. This produces a valid `CapturePayload` for a project: a
// gently sloped yard with realistic per-cell noise and a deliberately unwalked
// patch, so the coverage report has something to say. It goes through the exact
// same ingest as a real walk; nothing here is a shortcut around the decoder.

import { randomBytes } from 'node:crypto'

import { CAPTURE_CONTRACT_VERSION } from './contract'
import type { CapturePayload } from './contract'

export interface SynthesizeOptions {
  /** Grid width in cells. */
  cols?: number
  /** Grid height in cells. */
  rows?: number
  /** Cell spacing in metres (the resolution of the walk). */
  cellSizeM?: number
  /** Total fall across the yard, in metres, before noise. */
  slopeM?: number
  /** Fraction of the yard left unwalked, as one rectangular gap (0 = full). */
  gapFraction?: number
  /** Deterministic seed, so a test gets the same yard twice. */
  seed?: number
}

const DEFAULTS = {
  cols: 48,
  rows: 48,
  cellSizeM: 0.4,
  slopeM: 0.6,
  gapFraction: 0.12,
} as const

/** A tiny deterministic PRNG so a seeded synth is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function newCaptureId(): string {
  return `cap_${randomBytes(16).toString('hex')}`
}

/**
 * Build a plausible walked-yard payload. Metres throughout, exactly as a phone
 * would send, so it decodes through the real boundary rather than around it.
 */
export function synthesizeCapture(options: SynthesizeOptions = {}): CapturePayload {
  const cols = Math.max(2, Math.trunc(options.cols ?? DEFAULTS.cols))
  const rows = Math.max(2, Math.trunc(options.rows ?? DEFAULTS.rows))
  const cellSizeM = options.cellSizeM ?? DEFAULTS.cellSizeM
  const slopeM = options.slopeM ?? DEFAULTS.slopeM
  const gapFraction = Math.min(0.6, Math.max(0, options.gapFraction ?? DEFAULTS.gapFraction))
  const rand = mulberry32(options.seed ?? (Date.now() & 0xffffffff))

  const cells = cols * rows
  const elevations: number[] = new Array<number>(cells)
  const coverage: number[] = new Array<number>(cells)

  // The unwalked patch: a rectangle in one corner, sized by the gap fraction.
  const gapW = Math.round(cols * Math.sqrt(gapFraction))
  const gapH = Math.round(rows * Math.sqrt(gapFraction))

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c
      // A plane that falls from the far corner to the near one, plus gentle
      // undulation, so the terrain reads as ground rather than a ramp.
      const plane = (slopeM * (c + r)) / (cols + rows)
      const wobble = 0.04 * Math.sin(c / 3) * Math.cos(r / 4)
      const noise = (rand() - 0.5) * 0.03
      elevations[i] = plane + wobble + noise

      const inGap = gapFraction > 0 && c >= cols - gapW && r >= rows - gapH
      // Covered cells return near-full confidence with a little scatter; the
      // gap returns nothing, which is what a spot nobody walked looks like.
      coverage[i] = inGap ? 0 : Math.min(1, 0.85 + rand() * 0.15)
    }
  }

  return {
    contractVersion: CAPTURE_CONTRACT_VERSION,
    captureId: newCaptureId(),
    capturedAt: new Date().toISOString(),
    device: { model: 'Synthetic', osVersion: 'n/a', appVersion: 'web-replay' },
    frame: {
      originEastM: 0,
      originNorthM: 0,
      cellSizeM,
      cols,
      rows,
    },
    benchmark: {
      label: 'Simulated benchmark',
      // The benchmark tap sits at the low corner, called datum zero.
      eastM: 0,
      northM: 0,
      arElevationM: 0,
      siteElevationFt: 0,
    },
    encoding: 'json',
    elevations,
    coverage,
  }
}
