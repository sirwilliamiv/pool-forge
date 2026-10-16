import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseRaw } from '@/modules/imports/visio/raw-parser'

const POOL = readFileSync('src/test/fixtures/visio/pool.raw.txt', 'utf8')
const HOUSE = readFileSync('src/test/fixtures/visio/house-deck-excerpt.raw.txt', 'utf8')

describe('parseRaw', () => {
  const doc = parseRaw(POOL)

  it('finds every master in file order', () => {
    expect(doc.masters).toHaveLength(50)
    expect(doc.masters[0]?.name).toBe('Standard Rectangle')
    expect(doc.masters[0]?.index).toBe(0)
    expect(doc.masters[7]?.name).toBe('Freeform Kidney 11')
  })

  it('keeps parentheses, quotes and ampersands in names', () => {
    const names = doc.masters.map(m => m.name)
    expect(names).toContain('Deck Jets (5)')
    expect(names).toContain('Pool Light W&C')
    expect(names).toContain('8" Tan  Brick')
  })

  it('reads the page size in drawing inches', () => {
    const rect = doc.masters[0]!
    expect(rect.widthIn).toBeCloseTo(3.125, 6)
    expect(rect.heightIn).toBeCloseTo(1.5, 6)
  })

  it('pairs each path with the style set just before it, across layers', () => {
    // Round Corners: five layers, each a filled path then a stroked copy.
    const round = doc.masters.find(m => m.name === 'Round Corners')!
    expect(round.paths).toHaveLength(10)
    expect(round.paths[0]?.style).toEqual({ fill: true, stroke: false, fillColor: '#00ffff', strokeColor: '#000000' })
    expect(round.paths[1]?.style).toEqual({ fill: false, stroke: true, fillColor: '#00ffff', strokeColor: '#000000' })
  })

  it('decodes every segment kind', () => {
    const rect = doc.masters[0]!.paths[0]!
    expect(rect.segments.map(s => s.action)).toEqual(['M', 'L', 'L', 'L', 'L', 'Z'])
    const arc = doc.masters.find(m => m.name === 'Round Corners')!.paths[2]!.segments[1]!
    // No sweep in the file: librevenge's SVG writer renders that as 1, and only that reading
    // puts the corner discs on the rectangle's corners (the page is 3.375 by 2.0).
    expect(arc).toEqual({ action: 'A', rx: 0.25, ry: 0.25, rotate: 180, largeArc: true, sweep: true, x: 0.25, y: 1.5 })
  })

  it('counts text and pictures without parsing them', () => {
    const text = doc.masters.find(m => m.name === 'SOB Text')!
    expect(text.paths).toHaveLength(0)
    expect(text.textObjects).toBe(1)
    const raster = parseRaw(HOUSE).masters.find(m => m.name === 'R_Concrete')!
    expect(raster.graphicObjects).toBe(1)
    expect(raster.paths).toHaveLength(0)
  })

  it('names an unnamed page after its position', () => {
    const text = 'startDocument()\n  startPage(svg:height: 0.75in, svg:width: 0.75in)\n  endPage\nendDocument()\n'
    const [m] = parseRaw(text).masters
    expect(m?.name).toBe('Untitled master 1')
    expect(m?.named).toBe(false)
  })

  it('reads an explicit sweep flag', () => {
    const text = [
      'startDocument()',
      '  startPage(draw:name: S, svg:height: 1.0000in, svg:width: 1.0000in)',
      '    setStyle(draw:fill: solid, draw:fill-color: #ff0000, draw:stroke: none)',
      '    drawPath (svg:d: ((librevenge:path-action: M, svg:x: 0.0000in, svg:y: 0.0000in), (librevenge:large-arc: 0, librevenge:path-action: A, librevenge:rotate: 0.0000, librevenge:sweep: 1, svg:rx: 0.5000in, svg:ry: 0.5000in, svg:x: 1.0000in, svg:y: 0.0000in), (librevenge:path-action: Z)))',
      '  endPage',
      'endDocument()',
    ].join('\n')
    const seg = parseRaw(text).masters[0]!.paths[0]!.segments[1]
    expect(seg).toMatchObject({ action: 'A', sweep: true, largeArc: false })
  })
})
