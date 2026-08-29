// What the phone uploads when somebody walks a backyard.
//
// The full prose version, written for whoever implements the iOS side, is
// `docs/lidar-capture-contract.md`. This file is the executable half: the Zod
// schema is the arbiter, and the doc describes what the schema enforces. If the
// two ever disagree, the schema is right and the doc is a bug.
//
// Three decisions are worth stating here because everything else follows from
// them:
//
//   1. The wire is metres. ARKit is metric, and asking the phone to convert is
//      asking a second codebase to hold a constant this one already holds.
//      `src/modules/capture/units.ts` is the single crossing point.
//
//   2. Coverage is a separate array, not a sentinel inside the elevations.
//      A DEM with `-9999` in the holes is a DEM that eventually gets averaged
//      with the holes in it. Here, an uncovered cell's elevation is not read at
//      all: whatever the phone put there is ignored by every consumer, which is
//      also a property test.
//
//   3. Nothing about the payload is trusted. Counts, lengths, ranges and
//      finiteness are all checked, and a payload that fails is answered with a
//      sentence rather than a parser's complaint.

import { z } from 'zod'

/**
 * The one number that says which contract this is.
 *
 * Bumped when a field changes meaning, never when a field is added. The server
 * refuses a version it does not know rather than guessing, because a capture
 * read under the wrong contract is a wrong earthwork volume on a signed quote.
 */
export const CAPTURE_CONTRACT_VERSION = 1

/**
 * Hard cap on cells in one capture.
 *
 * A 30x20 metre yard at 10cm spacing is 60,000 cells, which is the size this
 * was designed around. The cap is four times that so a larger lot or a finer
 * grid still lands, and a runaway client does not get to allocate unbounded
 * memory on the server.
 */
export const MAX_CAPTURE_CELLS = 250_000

/** Below this and the grid is finer than the sensor; above and it is not a DEM. */
export const MIN_CELL_SIZE_M = 0.02
export const MAX_CELL_SIZE_M = 1

/**
 * How far a cell may sit from the benchmark, in metres, in any direction.
 *
 * Two hundred metres is a very large residential lot. The point of the bound is
 * that a corrupt float cannot place a shot a hundred kilometres away and drag
 * the whole inverse-distance field towards it.
 */
export const MAX_FRAME_EXTENT_M = 200

/** Elevation range, in metres, relative to the ARKit origin. */
export const MAX_ELEVATION_M = 100

/**
 * Coverage at or above this counts as ground somebody actually measured.
 *
 * Not 1, and not 0. ARKit returns partial hits at the edge of the LiDAR cone
 * and in bright sun, and a cell that got a third of its area returned is a real
 * measurement with a real height. A cell below this is ground nobody walked,
 * and every number derived from it has to say so.
 */
export const MEASURED_COVERAGE_MIN = 0.35

/** Body cap for the upload route. 250k cells of base64 float32 is ~1.4MB. */
export const MAX_CAPTURE_BODY_BYTES = 24 * 1024 * 1024

const finite = (max: number) =>
  z.number().finite().min(-max).max(max)

/**
 * Where the capture sits, and how big its cells are.
 *
 * `originEastM` / `originNorthM` are the centre of cell (0, 0) in the capture
 * frame, which is a gravity-aligned frame whose origin is wherever the ARKit
 * session started. Nothing outside the capture cares where that was: everything
 * is resolved against the benchmark below.
 */
export const CaptureFrameSchema = z.object({
  originEastM: finite(MAX_FRAME_EXTENT_M),
  originNorthM: finite(MAX_FRAME_EXTENT_M),
  cellSizeM: z.number().finite().min(MIN_CELL_SIZE_M).max(MAX_CELL_SIZE_M),
  cols: z.number().int().min(2).max(MAX_CAPTURE_CELLS),
  rows: z.number().int().min(2).max(MAX_CAPTURE_CELLS),
  /**
   * Compass bearing of the frame's +north axis, if the phone had a heading.
   *
   * Recorded, not applied. Turning a capture to true north is an alignment
   * decision the builder makes against the drawing, and doing it silently on
   * ingest would rotate a yard under a plan that was already square to it.
   */
  headingDeg: z.number().finite().min(0).max(360).optional(),
})

/**
 * The tap that turns ARKit's arbitrary origin into a height on this site.
 *
 * ARKit's y is metres above wherever the session started, which is a number
 * with no meaning to anybody. The builder taps a spot they know - the door
 * sill, the top of the existing pad - and says what it is. That single pair is
 * the whole datum: every cell is shifted by the difference.
 *
 * Without it a capture is a shape with no height, and the grade model's
 * governing invariant is that a survey shot is an absolute height.
 */
export const CaptureBenchmarkSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  eastM: finite(MAX_FRAME_EXTENT_M),
  northM: finite(MAX_FRAME_EXTENT_M),
  /** What ARKit thought the ground was at that spot. */
  arElevationM: finite(MAX_ELEVATION_M),
  /**
   * What it actually is, in feet on this site's datum.
   *
   * Zero when the builder taps the house pad and calls it zero, which is the
   * common case and the default the app should offer.
   */
  siteElevationFt: z.number().finite().min(-1_000).max(1_000),
})

export const CaptureDeviceSchema = z.object({
  model: z.string().min(1).max(60),
  osVersion: z.string().min(1).max(30),
  appVersion: z.string().min(1).max(30),
})

/**
 * How the two big arrays are carried.
 *
 * `json` is plain arrays, which is what a first implementation should send and
 * what every test here reads. `base64` is little-endian Float32 elevations and
 * one byte of coverage per cell, which is about a fifth of the size on the wire
 * and is what a 60,000 cell yard on a cellular connection should use. They
 * decode to the same heightfield, and a property test says so.
 */
export const CaptureEncodingSchema = z.enum(['json', 'base64'])
export type CaptureEncoding = z.infer<typeof CaptureEncodingSchema>

/** Base64 with no data-url wrapper and no whitespace. */
const base64 = z
  .string()
  .max(Math.ceil((MAX_CAPTURE_CELLS * 4 * 4) / 3) + 8)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, 'must be plain base64')

export const CapturePayloadSchema = z.object({
  contractVersion: z.literal(CAPTURE_CONTRACT_VERSION),
  /**
   * Client-generated, stable across retries of the same walk.
   *
   * A phone that loses signal mid-upload retries with the same id, and the
   * server treats the second arrival as the same capture rather than a second
   * survey of the same yard.
   */
  captureId: z.string().regex(/^cap_[0-9a-f]{32}$/, 'must be cap_ followed by 32 hex characters'),
  capturedAt: z.string().datetime({ offset: true }),
  device: CaptureDeviceSchema.optional(),
  frame: CaptureFrameSchema,
  benchmark: CaptureBenchmarkSchema,
  encoding: CaptureEncodingSchema,
  /**
   * Row-major, `cols * rows` long, metres in the capture frame.
   *
   * Read only where coverage says the cell was measured. An uncovered cell may
   * carry anything, including zero, and nothing downstream will look at it.
   */
  elevations: z.union([z.array(z.number()), base64]),
  /**
   * Row-major, `cols * rows` long, 0 to 1.
   *
   * How much of the cell got a return, weighted by ARKit's own confidence.
   * Zero means the person never walked it.
   */
  coverage: z.union([z.array(z.number()), base64]),
})

export type CapturePayload = z.infer<typeof CapturePayloadSchema>
export type CaptureFrame = z.infer<typeof CaptureFrameSchema>
export type CaptureBenchmark = z.infer<typeof CaptureBenchmarkSchema>

/**
 * A capture that has been checked, decoded and converted.
 *
 * Everything downstream of `decodeCapture` reads this and never the payload.
 * Positions are canvas inches relative to the benchmark; heights are feet on
 * the site datum. There are no metres past this line.
 */
export interface Heightfield {
  captureId: string
  cols: number
  rows: number
  /** Cell pitch in canvas inches. */
  cellSizeIn: number
  /** Centre of cell (0, 0), canvas inches. */
  originXIn: number
  originYIn: number
  /**
   * Where the benchmark tap sits, canvas inches.
   *
   * Zero on a freshly decoded capture, because every cell is expressed relative
   * to it; moved by `placeHeightfield` when the capture is put on the drawing.
   * Carried explicitly rather than assumed to be the origin, so that placing a
   * capture cannot leave the datum shot behind at the drawing origin.
   */
  benchmarkXIn: number
  benchmarkYIn: number
  /** Row-major heights in feet on the site datum, `cols * rows` long. */
  elevationsFt: number[]
  /** Row-major, 0 to 1, `cols * rows` long. */
  coverage: number[]
  /** The datum: the height of ground nobody measured. */
  datumFt: number
  benchmarkLabel: string | null
  capturedAt: string
}

/** Why a capture was refused. Carried to the route so it can pick a status. */
export type CaptureRejectionCode =
  | 'UNSUPPORTED_VERSION'
  | 'MALFORMED'
  | 'TOO_LARGE'
  | 'INCONSISTENT'
  | 'NO_COVERAGE'

/**
 * A refusal with a sentence attached.
 *
 * The sentence is what a person is shown, so it says what happened and what
 * they can do. The technical detail stays in the audit row and the server log.
 */
export class CaptureRejection extends Error {
  constructor(
    readonly code: CaptureRejectionCode,
    message: string,
  ) {
    super(message)
    this.name = 'CaptureRejection'
  }
}

const CAPTURE_CODES: readonly CaptureRejectionCode[] = [
  'UNSUPPORTED_VERSION',
  'MALFORMED',
  'TOO_LARGE',
  'INCONSISTENT',
  'NO_COVERAGE',
]

const ENCODED = /^([A-Z_]+): ([\s\S]*)$/

export function encodeCaptureRejection(rejection: CaptureRejection): string {
  return `${rejection.code}: ${rejection.message}`
}

export function decodeCaptureRejection(
  error: string,
): { code: CaptureRejectionCode; message: string } | null {
  const match = ENCODED.exec(error)
  const code = match?.[1]
  const message = match?.[2]
  if (!code || message === undefined) return null
  const known = CAPTURE_CODES.find(c => c === code)
  if (!known) return null
  return { code: known, message }
}

export function statusForCaptureRejection(code: CaptureRejectionCode): number {
  switch (code) {
    case 'TOO_LARGE':
      return 413
    case 'UNSUPPORTED_VERSION':
      return 409
    case 'MALFORMED':
    case 'INCONSISTENT':
    case 'NO_COVERAGE':
      return 400
  }
}
