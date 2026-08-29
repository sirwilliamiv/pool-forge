// Page-1 rasterization for PDF site plans and plats.
//
// Library choice: `@hyzyla/pdfium`. It is a single pure-wasm dependency (no
// node-gyp, no `canvas`, no system libraries), it runs unchanged in the Next.js
// Node runtime, and PDFium itself is BSD-3, which matters for a commercial
// product. The alternatives were rejected: `pdfjs-dist` needs a canvas backend,
// which means a second native dependency, and `mupdf` is AGPL.
//
// Only page 1 is ever rasterized. Multi-page PDF sets are out of scope for v1
// per the design spec.

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { logIngestFailure } from './errors'
import { IngestRejection } from './types'

/** Long-edge target for the rasterized page, before the vision downscale. */
export const PDF_RASTER_MAX_EDGE_PX = 2400

/** Never rasterize beyond this, whatever the page's declared media box says. */
const MAX_RASTER_SCALE = 8

export interface RasterizedPage {
  /** Raw RGBA, row-major, no padding. Feed straight into sharp's `raw` input. */
  data: Buffer
  width: number
  height: number
}

type PdfiumLibrary = {
  loadDocument: (bytes: Buffer) => Promise<PdfiumDocument>
}

type PdfiumDocument = {
  getPageCount: () => number
  getPage: (index: number) => PdfiumPage
  destroy: () => void
}

type PdfiumPage = {
  getSize: (options: { scale: number }) => { width: number; height: number }
  render: (options: {
    scale: number
    render: 'bitmap'
  }) => Promise<{ width: number; height: number; data: Uint8Array }>
}

/**
 * On a Node server the package locates its own wasm and this returns null. The
 * package decides that by branching on `typeof window`, so under the jsdom test
 * runner it takes the browser path instead and refuses to start without an
 * explicit binary. Hence the read below, deliberately written as a runtime path
 * rather than a `require.resolve`: a static specifier would make the bundler
 * treat a 3MB wasm file as a module graph edge.
 */
async function loadWasmBinary(): Promise<ArrayBuffer | null> {
  if (typeof window === 'undefined') return null
  try {
    const path = join(process.cwd(), 'node_modules', '@hyzyla', 'pdfium', 'dist', 'pdfium.wasm')
    return new Uint8Array(await readFile(path)).buffer
  } catch {
    return null
  }
}

// The wasm module is a few megabytes; initialising it once per process rather
// than once per upload is the difference between a fast route and a slow one.
let libraryPromise: Promise<PdfiumLibrary> | null = null

async function library(): Promise<PdfiumLibrary> {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const mod = await import('@hyzyla/pdfium')
      const wasmBinary = await loadWasmBinary()
      const init = wasmBinary
        ? mod.PDFiumLibrary.init({ wasmBinary })
        : mod.PDFiumLibrary.init()
      return init as unknown as PdfiumLibrary
    })().catch((err) => {
      libraryPromise = null
      throw err
    })
  }
  return libraryPromise
}

/** PDFium hands back BGRA; sharp's raw input wants RGBA. Swap in place. */
function bgraToRgba(data: Uint8Array): Buffer {
  const out = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  for (let i = 0; i + 3 < out.length; i += 4) {
    const b = out[i]
    const r = out[i + 2]
    if (b === undefined || r === undefined) break
    out[i] = r
    out[i + 2] = b
  }
  return out
}

/**
 * Rasterizes page 1 of a PDF. Throws `IngestRejection('CORRUPT')` for anything
 * PDFium refuses; the underlying error is logged against a correlation ref and
 * never surfaced.
 */
export async function rasterizeFirstPage(bytes: Buffer): Promise<RasterizedPage> {
  let doc: PdfiumDocument | null = null
  try {
    const lib = await library()
    doc = await lib.loadDocument(bytes)

    if (doc.getPageCount() < 1) {
      throw new IngestRejection('CORRUPT', 'That PDF has no pages.')
    }

    const page = doc.getPage(0)
    const natural = page.getSize({ scale: 1 })
    const longEdge = Math.max(natural.width, natural.height)
    if (!Number.isFinite(longEdge) || longEdge <= 0) {
      throw new IngestRejection('CORRUPT', 'That PDF page has no usable size.')
    }

    const scale = Math.min(MAX_RASTER_SCALE, Math.max(1, PDF_RASTER_MAX_EDGE_PX / longEdge))
    const rendered = await page.render({ scale, render: 'bitmap' })

    if (rendered.width < 1 || rendered.height < 1) {
      throw new IngestRejection('CORRUPT', 'That PDF page could not be rendered.')
    }

    return {
      data: bgraToRgba(rendered.data),
      width: rendered.width,
      height: rendered.height,
    }
  } catch (err) {
    if (err instanceof IngestRejection) throw err
    const ref = logIngestFailure('pdf rasterize', err)
    throw new IngestRejection('CORRUPT', `That PDF could not be read (ref ${ref}).`)
  } finally {
    try {
      doc?.destroy()
    } catch {
      // A destroy failure must not mask the real outcome.
    }
  }
}
