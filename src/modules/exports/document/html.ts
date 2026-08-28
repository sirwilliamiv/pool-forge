// The file format of a stored document, and the only two functions allowed to
// write it or read it back.
//
// A stored export is one self-contained HTML file: no stylesheet link, no
// script, no font request, no reference to anything this app serves. That is
// what makes it evidence. Open it in five years, offline, and it renders what
// was sent.
//
// The shell is written with fixed landmarks (`pf-document-style`,
// `pf-document-root`) so reading it back is exact rather than a guess at where
// the document starts. `extractDocumentParts` is the inverse of
// `documentShell`, and a round-trip test holds them together.

import { createHash } from 'node:crypto'

export const DOCUMENT_MIME_TYPE = 'text/html; charset=utf-8'

export const STYLE_ID = 'pf-document-style'
export const ROOT_ID = 'pf-document-root'
export const BODY_CLASS = 'pf-document-body'

const ROOT_OPEN = `<div id="${ROOT_ID}"`
const ROOT_CLOSE = `</div>\n</body>`
const STYLE_OPEN = `<style id="${STYLE_ID}">`
const STYLE_CLOSE = `</style>`

/**
 * Provenance, written into the file itself.
 *
 * The `Export` row says which project and when. The file has to say it too, or
 * a copy that has been emailed on and downloaded again is an anonymous page of
 * HTML with a price on it.
 */
export interface DocumentProvenance {
  kind: string
  projectId: string
  projectName: string
  jobNumber: number | null
  generatedAt: Date
  /** Which price book priced it, when one did. Answers "why these numbers". */
  priceBookId: string | null
}

export interface DocumentShellInput {
  title: string
  css: string
  rootClassName: string
  markup: string
  provenance: DocumentProvenance
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function metaTag(name: string, content: string): string {
  return `<meta name="${escapeHtml(name)}" content="${escapeHtml(content)}">`
}

export function documentShell(input: DocumentShellInput): string {
  const p = input.provenance
  const meta = [
    metaTag('pf:kind', p.kind),
    metaTag('pf:project-id', p.projectId),
    metaTag('pf:project-name', p.projectName),
    metaTag('pf:job-number', p.jobNumber === null ? '' : String(p.jobNumber)),
    metaTag('pf:generated-at', p.generatedAt.toISOString()),
    metaTag('pf:price-book-id', p.priceBookId ?? ''),
  ].join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(input.title)}</title>
${meta}
${STYLE_OPEN}
${input.css}
${STYLE_CLOSE}
</head>
<body class="${BODY_CLASS}">
<div id="${ROOT_ID}" class="${escapeHtml(input.rootClassName)}">${input.markup}${ROOT_CLOSE}
</html>
`
}

export interface DocumentParts {
  css: string
  /** The document body, without the wrapper div. */
  markup: string
  rootClassName: string
}

/**
 * Read a stored file back into the two pieces the share page needs to show it
 * inline: the stylesheet and the markup.
 *
 * Returns null rather than throwing for anything that is not a file this
 * renderer wrote, and refuses outright on a `<script`. Nothing in the render
 * path can emit one — React escapes every string it prints — so a script in a
 * stored file means the bytes are not the bytes we stored, and the right
 * response to that is to show nothing rather than to run it.
 */
export function extractDocumentParts(html: string): DocumentParts | null {
  if (/<script/i.test(html)) return null

  const styleStart = html.indexOf(STYLE_OPEN)
  if (styleStart < 0) return null
  const cssFrom = styleStart + STYLE_OPEN.length
  const styleEnd = html.indexOf(STYLE_CLOSE, cssFrom)
  if (styleEnd < 0) return null

  const rootStart = html.indexOf(ROOT_OPEN)
  if (rootStart < 0) return null
  const openEnd = html.indexOf('>', rootStart)
  if (openEnd < 0) return null
  const rootEnd = html.lastIndexOf(ROOT_CLOSE)
  if (rootEnd < 0 || rootEnd < openEnd) return null

  const attrs = html.slice(rootStart + ROOT_OPEN.length, openEnd)
  const classMatch = /class="([^"]*)"/.exec(attrs)

  return {
    css: html.slice(cssFrom, styleEnd).trim(),
    markup: html.slice(openEnd + 1, rootEnd),
    rootClassName: classMatch?.[1] ?? '',
  }
}

/** The hash stored on the row. Content-addressed bytes, so this is the identity. */
export function hashDocument(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
