// The heightfield in and out of Postgres.
//
// Two arrays of 60,000 numbers each is 1.2MB of JSON text that has to be parsed
// on every read, so both go in as bytes: heights as little-endian float32,
// coverage as one byte per cell. That is 300KB for the same yard and no parse
// at all.
//
// Float32 is a decision, not an oversight. A height in feet on a residential
// site is under a few hundred, and float32 holds that to about a ten-thousandth
// of a foot, which is a thousandth of an inch. The phone's own depth error is
// two orders of magnitude larger. The round-trip test asserts the tolerance
// rather than exact equality, and says why.

import type { Heightfield } from './contract'

const FLOAT_BYTES = 4

export interface PackedHeightfield {
  elevationsFt: Uint8Array<ArrayBuffer>
  coverage: Uint8Array<ArrayBuffer>
}

export function packHeightfield(field: Heightfield): PackedHeightfield {
  const cells = field.cols * field.rows
  // Plain ArrayBuffers rather than Node Buffers: Prisma's `Bytes` column takes
  // `Uint8Array<ArrayBuffer>`, and a Buffer can be backed by a SharedArrayBuffer
  // as far as the type system knows.
  const elevations = new Uint8Array(cells * FLOAT_BYTES)
  const heights = new DataView(elevations.buffer)
  const coverage = new Uint8Array(cells)

  for (let i = 0; i < cells; i++) {
    heights.setFloat32(i * FLOAT_BYTES, field.elevationsFt[i] ?? field.datumFt, true)
    const cover = field.coverage[i] ?? 0
    coverage[i] = Math.max(0, Math.min(255, Math.round(cover * 255)))
  }

  return { elevationsFt: elevations, coverage }
}

/** Everything a stored row carries, in the shape the reader needs it. */
export interface StoredCapture {
  captureId: string
  cols: number
  rows: number
  cellSizeIn: number
  originXIn: number
  originYIn: number
  benchmarkXIn: number
  benchmarkYIn: number
  datumFt: number
  benchmarkLabel: string | null
  capturedAt: Date
  elevationsFt: Uint8Array
  coverage: Uint8Array
}

/**
 * Rebuild the heightfield from a row.
 *
 * Defensive about length: a truncated column would otherwise read past the end
 * and hand back undefined heights, which arrive downstream as NaN and print as
 * a NaN volume on a quote. A row whose arrays do not match its own cell count
 * is refused rather than half-read.
 */
export function unpackHeightfield(row: StoredCapture): Heightfield {
  const cells = row.cols * row.rows
  if (row.elevationsFt.byteLength !== cells * FLOAT_BYTES || row.coverage.byteLength !== cells) {
    throw new Error(
      `stored capture ${row.captureId} is inconsistent: ${cells} cells, ` +
        `${row.elevationsFt.byteLength} height bytes, ${row.coverage.byteLength} coverage bytes`,
    )
  }

  const heights = new DataView(
    row.elevationsFt.buffer,
    row.elevationsFt.byteOffset,
    row.elevationsFt.byteLength,
  )
  const elevationsFt: number[] = new Array<number>(cells)
  const coverage: number[] = new Array<number>(cells)
  for (let i = 0; i < cells; i++) {
    elevationsFt[i] = heights.getFloat32(i * FLOAT_BYTES, true)
    coverage[i] = (row.coverage[i] ?? 0) / 255
  }

  return {
    captureId: row.captureId,
    cols: row.cols,
    rows: row.rows,
    cellSizeIn: row.cellSizeIn,
    originXIn: row.originXIn,
    originYIn: row.originYIn,
    benchmarkXIn: row.benchmarkXIn,
    benchmarkYIn: row.benchmarkYIn,
    elevationsFt,
    coverage,
    datumFt: row.datumFt,
    benchmarkLabel: row.benchmarkLabel,
    capturedAt: row.capturedAt.toISOString(),
  }
}
