// Turn a built document into the bytes that get stored.
//
// Rendering choice, stated once so it is not re-litigated at every call site:
// the stored artifact is a single self-contained HTML file, produced by
// serialising the very same React element the route renders and compiling the
// stylesheet from the resulting markup. No headless browser, no second layout
// engine, no re-implementation of four documents in a PDF library.
//
// What that buys: the stored copy and the on-screen copy are the same component
// tree with the same props, so they cannot say different numbers; it runs on a
// server with no display and no Chromium; it costs about 60 ms and about 40 KB
// per document; and it works unchanged for all four kinds, including the two
// that are mostly inline SVG.
//
// What it does not buy, stated plainly: an HTML file is not a paginated
// artifact. It fixes the content, the numbers, the wording and the drawing, and
// it fixes the styling down to resolved colour values. It does not fix where
// the page breaks fell or which font the reader's machine substituted. It is
// evidence of what was said, not a photograph of a sheet of paper.

import { buildExportDocument } from './build'
import {
  DOCUMENT_MIME_TYPE,
  documentShell,
  hashDocument,
  type DocumentProvenance,
} from './html'
import type { DocumentKind, DocumentOptions } from './kinds'
import { STANDALONE_FRAME_CSS } from './print-css'
import { stylesheetFor } from './stylesheet'

export interface RenderedExportDocument {
  kind: DocumentKind
  title: string
  html: string
  bytes: Buffer
  contentHash: string
  byteSize: number
  mimeType: string
  provenance: DocumentProvenance
}

/**
 * Render a document to storable bytes, or null when the project is not this
 * organisation's.
 */
export async function renderExportDocument(args: {
  kind: DocumentKind
  projectId: string
  orgId: string
  options: DocumentOptions
}): Promise<RenderedExportDocument | null> {
  const built = await buildExportDocument(args)
  if (!built) return null

  // Imported at the point of use, not at the top of the file. `react-dom/server`
  // in an import statement fails the build outright for any module webpack can
  // reach from a client entry, and the command registry is reachable from one:
  // the editor's palette imports it. Nothing here ever runs in a browser, and
  // this is what keeps the bundler from having to believe that.
  const { renderToStaticMarkup } = await import('react-dom/server')
  const markup = renderToStaticMarkup(built.element)
  const css = await stylesheetFor(markup, `${built.pageCss}\n${STANDALONE_FRAME_CSS}`)

  const html = documentShell({
    title: built.title,
    css,
    rootClassName: built.rootClassName,
    markup,
    provenance: built.provenance,
  })

  const bytes = Buffer.from(html, 'utf8')
  return {
    kind: built.kind,
    title: built.title,
    html,
    bytes,
    contentHash: hashDocument(bytes),
    byteSize: bytes.byteLength,
    mimeType: DOCUMENT_MIME_TYPE,
    provenance: built.provenance,
  }
}
