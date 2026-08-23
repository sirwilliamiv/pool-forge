// Synthetic backyards, for testing a capture without an iPhone.
//
// The iOS app does not exist yet, so every test of the server side has to
// invent its own yards. Inventing them by hand produces the yard the code
// already handles: a flat rectangle, fully covered, benchmarked at zero. The
// interesting cases are the ones a builder actually walks into, so they are
// generated here and shared:
//
//   - a lot that falls three feet from the house to the back fence,
//   - a drainage swale cutting across it, which is the feature that decides
//     the dig and the one a uniform decimation walks straight past,
//   - a flat pad where a slab used to be, with a step at its edge,
//   - and the coverage patterns that matter: a stripe the person skipped
//     because the shed was in the way, and the faded edges LiDAR returns in
//     direct sun.
//
// Terrain is described in metres because that is what the phone sends. Nothing
// in this file converts anything: the conversion is the code under test.

import {
  CAPTURE_CONTRACT_VERSION,
  type CapturePayload,
  type CaptureEncoding,
} from '@/modules/capture/contract'

export interface YardOptions {
  cols?: number
  rows?: number
  cellSizeM?: number
  /** Height in metres at a point in the capture frame. */
  terrain?: (eastM: number, northM: number) => number
  /** 0 to 1 for a cell. Zero means nobody walked it. */
  coverage?: (col: number, row: number) => number
  encoding?: CaptureEncoding
  /** What the tapped spot really is, in feet on the site datum. */
  siteElevationFt?: number
  /** Where the tap was, in metres in the capture frame. */
  benchmarkEastM?: number
  benchmarkNorthM?: number
  benchmarkLabel?: string
  captureId?: string
  capturedAt?: string
  originEastM?: number
  originNorthM?: number
}

/** Deterministic ids, so a failing property shrinks to something reproducible. */
export function captureId(seed: number): string {
  const hex = Math.abs(Math.floor(seed)).toString(16).padStart(8, '0').slice(0, 8)
  return `cap_${hex.repeat(4)}`
}

// --- terrain ---------------------------------------------------------------

/** Dead flat at one height. The common case, and the one that must cost nothing. */
export const flat =
  (metres = 0) =>
  (): number =>
    metres

/** Falls `fallM` over the whole depth, which is what most lots do. */
export const slope =
  (fallM = 0.9, depthM = 20) =>
  (_eastM: number, northM: number): number =>
    -fallM * (northM / depthM)

/**
 * A slope with a drainage swale cut across it.
 *
 * The swale is the point. It is half a metre deep and two metres wide, it is
 * where the water goes, and a decimation that samples every nth cell will
 * report the site as a clean plane and under-quote the dig by the volume of
 * the trench.
 */
export const swale =
  (fallM = 0.9, depthM = 20, swaleNorthM = 12, swaleDepthM = 0.5, swaleWidthM = 2) =>
  (eastM: number, northM: number): number => {
    const base = slope(fallM, depthM)(eastM, northM)
    const across = (northM - swaleNorthM) / swaleWidthM
    return base - swaleDepthM * Math.exp(-across * across)
  }

/** A flat pad with a step down off its edge, like a slab that is coming out. */
export const padWithStep =
  (padEastM = 8, padHeightM = 0.3) =>
  (eastM: number): number =>
    eastM < padEastM ? padHeightM : 0

// --- coverage --------------------------------------------------------------

/** Everything walked. */
export const fullyWalked = (): number => 1

/**
 * One lawnmower stripe skipped, because the shed was in the way.
 *
 * The single most important case in this whole feature: the surface still
 * interpolates smoothly across the gap and looks exactly like measured ground.
 */
export const skippedStripe =
  (fromRow: number, toRow: number) =>
  (_col: number, row: number): number =>
    row >= fromRow && row < toRow ? 0 : 1

/**
 * Strong returns in the middle, nothing at the far edges.
 *
 * LiDAR is good to about five metres and degrades in direct sun, so the edge of
 * a capture fades rather than stopping.
 */
export const fadedEdges =
  (cols: number, rows: number, marginCells = 3) =>
  (col: number, row: number): number => {
    const edge = Math.min(col, row, cols - 1 - col, rows - 1 - row)
    if (edge >= marginCells) return 1
    return edge / marginCells
  }

/** A rectangular hole somebody walked around. */
export const hole =
  (fromCol: number, toCol: number, fromRow: number, toRow: number) =>
  (col: number, row: number): number =>
    col >= fromCol && col < toCol && row >= fromRow && row < toRow ? 0 : 1

/** Both, composed, because a real walk has more than one thing wrong with it. */
export const both =
  (a: (col: number, row: number) => number, b: (col: number, row: number) => number) =>
  (col: number, row: number): number =>
    Math.min(a(col, row), b(col, row))

// --- the payload -----------------------------------------------------------

function encodeFloats(values: number[]): string {
  const bytes = new Uint8Array(values.length * 4)
  const view = new DataView(bytes.buffer)
  values.forEach((value, i) => view.setFloat32(i * 4, value, true))
  return Buffer.from(bytes).toString('base64')
}

function encodeCoverage(values: number[]): string {
  const bytes = new Uint8Array(values.length)
  values.forEach((value, i) => {
    bytes[i] = Math.max(0, Math.min(255, Math.round(value * 255)))
  })
  return Buffer.from(bytes).toString('base64')
}

/**
 * One walked yard, as the phone would send it.
 *
 * The default is a 30 by 20 metre lot at 10cm spacing, which is 60,000 cells:
 * the size this whole feature was designed around, and the size the tests
 * should be run at rather than at something comfortable.
 */
export function syntheticYard(options: YardOptions = {}): CapturePayload {
  const cols = options.cols ?? 300
  const rows = options.rows ?? 200
  const cellSizeM = options.cellSizeM ?? 0.1
  const originEastM = options.originEastM ?? 0
  const originNorthM = options.originNorthM ?? 0
  const terrain = options.terrain ?? slope()
  const cover = options.coverage ?? fullyWalked
  const encoding = options.encoding ?? 'json'

  const elevations: number[] = []
  const coverage: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const eastM = originEastM + col * cellSizeM
      const northM = originNorthM + row * cellSizeM
      const walked = cover(col, row)
      coverage.push(walked)
      // An unwalked cell carries whatever ARKit last guessed, which is not the
      // ground. Deliberately poisoned here rather than zeroed: a consumer that
      // reads an unwalked height should produce an obviously wrong answer in a
      // test rather than a plausible one.
      elevations.push(walked > 0 ? terrain(eastM, northM) : -42)
    }
  }

  const benchmarkEastM = options.benchmarkEastM ?? originEastM + (cols * cellSizeM) / 2
  const benchmarkNorthM = options.benchmarkNorthM ?? originNorthM
  const payload: CapturePayload = {
    contractVersion: CAPTURE_CONTRACT_VERSION,
    captureId: options.captureId ?? captureId(1),
    capturedAt: options.capturedAt ?? '2026-08-22T15:04:05.000Z',
    frame: { originEastM, originNorthM, cellSizeM, cols, rows },
    benchmark: {
      eastM: benchmarkEastM,
      northM: benchmarkNorthM,
      arElevationM: terrain(benchmarkEastM, benchmarkNorthM),
      siteElevationFt: options.siteElevationFt ?? 0,
    },
    encoding,
    elevations: encoding === 'base64' ? encodeFloats(elevations) : elevations,
    coverage: encoding === 'base64' ? encodeCoverage(coverage) : coverage,
  }
  if (options.benchmarkLabel !== undefined) payload.benchmark.label = options.benchmarkLabel
  return payload
}

/** A small yard, for tests that care about a shape rather than a size. */
export function smallYard(options: YardOptions = {}): CapturePayload {
  return syntheticYard({ cols: 40, rows: 30, cellSizeM: 0.25, ...options })
}
