// The file format of a stored document.
//
// `documentShell` writes it and `extractDocumentParts` reads it back, and the
// share page depends on the two agreeing exactly: it pulls the stylesheet and
// the markup out of a file written months earlier and renders them inline. A
// drift between the writer and the reader shows up as a customer looking at an
// unstyled proposal, so it is pinned here rather than discovered there.

import { ExportKind } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  BODY_CLASS,
  ROOT_ID,
  documentShell,
  escapeHtml,
  extractDocumentParts,
  hashDocument,
  type DocumentProvenance,
} from '@/modules/exports/document/html'
import { documentFilename, isDocumentKind } from '@/modules/exports/document/kinds'
import { classVocabulary } from '@/modules/exports/document/stylesheet'

const provenance: DocumentProvenance = {
  kind: ExportKind.CUSTOMER_PROPOSAL,
  projectId: 'prj_1',
  projectName: 'Alvarez Residence',
  jobNumber: 1042,
  generatedAt: new Date('2026-03-14T15:09:26.000Z'),
  priceBookId: 'pb_7',
}

const CSS = '.proposal-page{padding:0.5in}\n@page{size:letter}'
const MARKUP = '<article class="proposal-page text-slate-900"><h1>Pool Construction</h1></article>'

function shell(overrides: Partial<Parameters<typeof documentShell>[0]> = {}): string {
  return documentShell({
    title: 'Proposal · Job 1042 · Alvarez Residence',
    css: CSS,
    rootClassName: '',
    markup: MARKUP,
    provenance,
    ...overrides,
  })
}

describe('stored document file', () => {
  it('is a standalone file with no external reference of any kind', () => {
    const html = shell()
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/<link\b/i)
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/src="https?:/i)
    expect(html).toContain(`<body class="${BODY_CLASS}">`)
    expect(html).toContain(`<div id="${ROOT_ID}"`)
  })

  it('carries its own provenance, so a downloaded copy still says what it is', () => {
    const html = shell()
    expect(html).toContain('content="CUSTOMER_PROPOSAL"')
    expect(html).toContain('content="prj_1"')
    expect(html).toContain('content="Alvarez Residence"')
    expect(html).toContain('content="1042"')
    expect(html).toContain('content="2026-03-14T15:09:26.000Z"')
    expect(html).toContain('content="pb_7"')
  })

  it('round-trips the stylesheet and the markup exactly', () => {
    const parts = extractDocumentParts(shell())
    expect(parts).not.toBeNull()
    expect(parts?.css).toBe(CSS)
    expect(parts?.markup).toBe(MARKUP)
  })

  it('round-trips a root class name', () => {
    const parts = extractDocumentParts(shell({ rootClassName: 'construction-doc size-tabloid' }))
    expect(parts?.rootClassName).toBe('construction-doc size-tabloid')
  })

  it('round-trips markup that closes a div immediately before the end', () => {
    // The end marker is `</div>` followed by a newline and `</body>`, and React
    // never emits a newline between tags, so a document whose own last element
    // is a div must not truncate.
    const markup = '<div class="a"><div class="b">x</div></div>'
    const parts = extractDocumentParts(shell({ markup }))
    expect(parts?.markup).toBe(markup)
  })

  it('escapes a title and a project name that contain markup', () => {
    const html = shell({
      title: 'Proposal <script>alert(1)</script>',
      provenance: { ...provenance, projectName: '"Bad" & <name>' },
    })
    expect(html).not.toMatch(/<script/i)
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('content="&quot;Bad&quot; &amp; &lt;name&gt;"')
  })

  it('refuses to read back a file containing a script', () => {
    const tampered = shell().replace('<h1>', '<script>alert(1)</script><h1>')
    expect(extractDocumentParts(tampered)).toBeNull()
  })

  it('refuses anything that is not a file this renderer wrote', () => {
    expect(extractDocumentParts('<html><body><p>hello</p></body></html>')).toBeNull()
    expect(extractDocumentParts('')).toBeNull()
  })

  it('escapeHtml covers every character that could break out of an attribute', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('document hashing', () => {
  it('is the sha256 of the bytes, so identical bytes hash identically', () => {
    const a = Buffer.from('the same document', 'utf8')
    const b = Buffer.from('the same document', 'utf8')
    expect(hashDocument(a)).toBe(hashDocument(b))
    expect(hashDocument(a)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when one character of the document changes', () => {
    expect(hashDocument(Buffer.from('$182,400'))).not.toBe(hashDocument(Buffer.from('$182,401')))
  })
})

describe('class vocabulary', () => {
  it('collects every class in the markup, deduplicated and sorted', () => {
    expect(classVocabulary('<a class="b a"></a><i class="a c"></i>')).toEqual(['a', 'b', 'c'])
  })

  it('keeps arbitrary values, which the documents use for point sizes and inches', () => {
    expect(classVocabulary('<p class="text-[11pt] max-w-[8in]"></p>')).toEqual([
      'max-w-[8in]',
      'text-[11pt]',
    ])
  })

  it('ignores an attribute that merely ends in class', () => {
    expect(classVocabulary('<a data-class="nope"></a>')).toEqual([])
  })
})

describe('document kinds', () => {
  it('does not treat IMAGE as a document this app renders', () => {
    expect(isDocumentKind(ExportKind.IMAGE)).toBe(false)
    expect(isDocumentKind(ExportKind.CUSTOMER_PROPOSAL)).toBe(true)
  })

  it('names a file after the job number and the day it was sent', () => {
    expect(
      documentFilename({
        kind: ExportKind.CUSTOMER_PROPOSAL,
        jobNumber: 1042,
        exportId: 'cmexport12345678',
        generatedAt: new Date('2026-03-14T15:09:26.000Z'),
      }),
    ).toBe('proposal-1042-2026-03-14.html')
  })

  it('falls back to the row id when a project was never numbered', () => {
    expect(
      documentFilename({
        kind: ExportKind.SITE_PLAN,
        jobNumber: null,
        exportId: 'cmexport12345678',
        generatedAt: new Date('2026-03-14T15:09:26.000Z'),
      }),
    ).toBe('site-plan-12345678-2026-03-14.html')
  })
})
