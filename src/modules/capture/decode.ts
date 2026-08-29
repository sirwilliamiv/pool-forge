// Turning an uploaded capture into a heightfield this codebase can read.
//
// This is the boundary. Above it are metres, base64 and a client that might be
// lying; below it are canvas inches, feet on the site datum, and arrays whose
// lengths have been checked. Nothing downstream re-validates, so everything
// that could be wrong has to be wrong here or not at all.
//
// The order matters: cheap structural checks before anything is allocated, then
// the cell count before the arrays are read, then the arrays. A payload
// claiming forty million cells is refused before it can ask for the memory.

import {
  CAPTURE_CONTRACT_VERSION,
  CapturePayloadSchema,
  CaptureRejection,
  MAX_CAPTURE_CELLS,
  MAX_ELEVATION_M,
  MEASURED_COVERAGE_MIN,
  type CapturePayload,
  type Heightfield,
} from './contract'
import { metresToFeet, metresToInches } from './units'

/** Bytes per elevation in the base64 encoding: one little-endian float32. */
const ELEVATION_BYTES = 4

function malformed(what: string): never {
  throw new CaptureRejection(
    'MALFORMED',
    `That site capture could not be read: ${what}. Nothing was changed. Walk the yard again, or send it from a newer version of the app.`,
  )
}

function inconsistent(what: string): never {
  throw new CaptureRejection(
    'INCONSISTENT',
    `That site capture does not add up: ${what}. Nothing was changed.`,
  )
}

/**
 * Decode one array from whichever encoding the payload declared.
 *
 * Length is checked against the cell count in both cases, because a grid that
 * says 200x300 and carries 4,000 heights is not a capture with a missing corner,
 * it is two different captures spliced together, and reading it row-major would
 * put the far fence in the middle of the lawn.
 */
function decodeFloats(raw: number[] | string, cells: number, name: string): number[] {
  if (typeof raw !== 'string') {
    if (raw.length !== cells) {
      inconsistent(`it says ${cells} cells but carries ${raw.length} ${name}`)
    }
    return raw
  }

  const bytes = Buffer.from(raw, 'base64')
  if (bytes.byteLength !== cells * ELEVATION_BYTES) {
    inconsistent(
      `it says ${cells} cells but carries ${bytes.byteLength} bytes of ${name}, not ${cells * ELEVATION_BYTES}`,
    )
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: number[] = new Array<number>(cells)
  for (let i = 0; i < cells; i++) out[i] = view.getFloat32(i * ELEVATION_BYTES, true)
  return out
}

/** Coverage is one byte per cell on the wire, 0 to 255, meaning 0 to 1. */
function decodeCoverage(raw: number[] | string, cells: number): number[] {
  if (typeof raw !== 'string') {
    if (raw.length !== cells) {
      inconsistent(`it says ${cells} cells but carries ${raw.length} coverage values`)
    }
    return raw
  }

  const bytes = Buffer.from(raw, 'base64')
  if (bytes.byteLength !== cells) {
    inconsistent(
      `it says ${cells} cells but carries ${bytes.byteLength} bytes of coverage, not ${cells}`,
    )
  }
  const out: number[] = new Array<number>(cells)
  for (let i = 0; i < cells; i++) out[i] = (bytes[i] ?? 0) / 255
  return out
}

/**
 * Validate, decode, convert.
 *
 * Throws `CaptureRejection` and nothing else. A raw Zod issue list, a
 * `RangeError` from an allocation, or a third-party message never leaves this
 * function: the caller turns the rejection into an audit row and a sentence.
 */
export function decodeCapture(raw: unknown): Heightfield {
  // The version check happens before the schema so an unknown version is
  // answered with "update the app" rather than with a complaint about a
  // literal, which is what a v2 phone hitting a v1 server actually needs to
  // hear.
  const declared =
    raw && typeof raw === 'object'
      ? (raw as { contractVersion?: unknown }).contractVersion
      : undefined
  if (typeof declared === 'number' && declared !== CAPTURE_CONTRACT_VERSION) {
    throw new CaptureRejection(
      'UNSUPPORTED_VERSION',
      `That site capture was recorded by a version of the app this server does not understand (capture format ${declared}, this server reads ${CAPTURE_CONTRACT_VERSION}). Nothing was changed.`,
    )
  }

  const parsed = CapturePayloadSchema.safeParse(raw)
  if (!parsed.success) {
    // The technical detail is deliberately not in the message. It goes to the
    // server log and the audit row, where a developer can find it, and never
    // in front of a builder standing in a yard.
    console.warn(
      `[capture] payload refused: ${parsed.error.issues
        .map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    )
    malformed('some of it was missing or not a number')
  }

  return heightfieldFrom(parsed.data)
}

/** The conversion half, split out so tests can build a payload and skip Zod. */
export function heightfieldFrom(payload: CapturePayload): Heightfield {
  const { frame, benchmark } = payload
  const cells = frame.cols * frame.rows

  if (cells > MAX_CAPTURE_CELLS) {
    throw new CaptureRejection(
      'TOO_LARGE',
      `That site capture is too big to process (${cells.toLocaleString()} cells, the limit is ${MAX_CAPTURE_CELLS.toLocaleString()}). Nothing was changed. Capture a smaller area, or walk it at a coarser spacing.`,
    )
  }

  const elevationsM = decodeFloats(payload.elevations, cells, 'heights')
  const coverage = decodeCoverage(payload.coverage, cells)

  const datumFt = benchmark.siteElevationFt
  const elevationsFt: number[] = new Array<number>(cells)
  let measured = 0

  for (let i = 0; i < cells; i++) {
    const cover = coverage[i] ?? 0
    if (!Number.isFinite(cover) || cover < 0 || cover > 1) {
      // Never clamped. A coverage of 1.4 is a broken client, and quietly
      // rounding it to 1 would turn a bug into ground the app claims somebody
      // walked.
      inconsistent(`a cell reports coverage of ${cover}, which is not between 0 and 1`)
    }

    if (cover < MEASURED_COVERAGE_MIN) {
      // Ground nobody walked. Whatever the phone put in the elevation array
      // here is not read, now or ever: it is replaced by the datum so a stray
      // float cannot reach the surface through some later code path that forgot
      // to check the mask.
      elevationsFt[i] = datumFt
      continue
    }

    const raw = elevationsM[i] ?? Number.NaN
    if (!Number.isFinite(raw) || Math.abs(raw) > MAX_ELEVATION_M) {
      inconsistent(`a measured cell reports a height of ${raw} metres`)
    }
    // The one arithmetic that matters. ARKit's height is relative to wherever
    // the session started, which means nothing; the benchmark tap says what one
    // known spot really is, and every cell moves by the same difference. A
    // shift, never a scale, so the shape of the ground cannot change here.
    elevationsFt[i] = metresToFeet(raw - benchmark.arElevationM) + datumFt
    measured += 1
  }

  if (measured === 0) {
    throw new CaptureRejection(
      'NO_COVERAGE',
      'That site capture has no measured ground in it: every cell came back empty. Nothing was changed. Walk the yard with the phone lower and slower, and keep out of direct sun.',
    )
  }

  const field: Heightfield = {
    captureId: payload.captureId,
    cols: frame.cols,
    rows: frame.rows,
    cellSizeIn: metresToInches(frame.cellSizeM),
    originXIn: metresToInches(frame.originEastM - benchmark.eastM),
    originYIn: metresToInches(frame.originNorthM - benchmark.northM),
    benchmarkXIn: 0,
    benchmarkYIn: 0,
    elevationsFt,
    coverage,
    datumFt,
    benchmarkLabel: benchmark.label ?? null,
    capturedAt: payload.capturedAt,
  }
  return field
}

/** Canvas-inch centre of one cell, relative to the benchmark. */
export function cellCentre(
  field: Pick<Heightfield, 'originXIn' | 'originYIn' | 'cellSizeIn'>,
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: field.originXIn + col * field.cellSizeIn,
    y: field.originYIn + row * field.cellSizeIn,
  }
}
