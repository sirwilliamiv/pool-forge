// `vss2raw` text to masters, paths and styles. Line oriented and pure.
//
// The format is librevenge's raw dump: one call per line, indented by nesting.
// Only the calls that carry geometry or tell us what a master is made of are
// read; layers, paragraphs and spans are skipped.

import {
  MAX_MASTERS_PER_FILE,
  type RawDocument,
  type RawMaster,
  type RawPath,
  type RawSegment,
  type RawStyle,
} from './types'

const PAGE_START = /^\s*startPage\((?:draw:name: (.*), )?svg:height: ([\d.]+)in, svg:width: ([\d.]+)in\)\s*$/
const STYLE_PAIR = /(\S+?): ([^,)]+)/g
const HEX_COLOR = /^#[0-9a-f]{6}$/

const NONE = 'none'
const KEY_FILL = 'draw:fill'
const KEY_FILL_COLOR = 'draw:fill-color'
const KEY_STROKE = 'draw:stroke'
const KEY_STROKE_COLOR = 'svg:stroke-color'
const KEY_ACTION = 'librevenge:path-action'
const KEY_LARGE_ARC = 'librevenge:large-arc'
const KEY_SWEEP = 'librevenge:sweep'
const KEY_ROTATE = 'librevenge:rotate'
const FLAG_TRUE = '1'
const INCH_SUFFIX = 'in'

const CALL_START_PAGE = 'startPage('
const CALL_END_PAGE = 'endPage'
const CALL_SET_STYLE = 'setStyle('
const CALL_DRAW_PATH = 'drawPath'
const CALL_TEXT = 'startTextObject'
const CALL_GRAPHIC = 'drawGraphicObject'
const PATH_OPEN = 'svg:d: (('
const PATH_CLOSE = ')))'
const GROUP_SEPARATOR = '), ('
const PAIR_SEPARATOR = ', '
const KEY_VALUE_SEPARATOR = ': '

const UNTITLED_PREFIX = 'Untitled master'

const EMPTY_STYLE: RawStyle = { fill: false, stroke: false, fillColor: null, strokeColor: null }

function color(value: string | undefined): string | null {
  if (value === undefined) return null
  const v = value.trim().toLowerCase()
  return HEX_COLOR.test(v) ? v : null
}

function parseStyle(line: string): RawStyle {
  const open = line.indexOf('(')
  const close = line.lastIndexOf(')')
  const body = open >= 0 && close > open ? line.slice(open + 1, close) : ''
  const values = new Map<string, string>()
  for (const match of body.matchAll(STYLE_PAIR)) {
    const key = match[1]
    const value = match[2]
    if (key !== undefined && value !== undefined) values.set(key, value.trim())
  }
  const fill = values.get(KEY_FILL)
  const stroke = values.get(KEY_STROKE)
  return {
    fill: fill !== undefined && fill !== NONE,
    stroke: stroke !== undefined && stroke !== NONE,
    fillColor: color(values.get(KEY_FILL_COLOR)),
    strokeColor: color(values.get(KEY_STROKE_COLOR)),
  }
}

function num(values: Map<string, string>, key: string): number {
  const raw = values.get(key)
  if (raw === undefined) return Number.NaN
  const trimmed = raw.endsWith(INCH_SUFFIX) ? raw.slice(0, -INCH_SUFFIX.length) : raw
  return Number(trimmed)
}

function flag(values: Map<string, string>, key: string): boolean {
  return values.get(key) === FLAG_TRUE
}

function parseSegment(group: string): RawSegment | null {
  const values = new Map<string, string>()
  for (const pair of group.split(PAIR_SEPARATOR)) {
    const at = pair.indexOf(KEY_VALUE_SEPARATOR)
    if (at < 0) continue
    values.set(pair.slice(0, at).trim(), pair.slice(at + KEY_VALUE_SEPARATOR.length).trim())
  }
  const x = num(values, 'svg:x')
  const y = num(values, 'svg:y')
  const segment = buildSegment(values.get(KEY_ACTION), values, x, y)
  if (!segment) return null
  for (const v of Object.values(segment)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return null
  }
  return segment
}

function buildSegment(
  action: string | undefined,
  values: Map<string, string>,
  x: number,
  y: number,
): RawSegment | null {
  switch (action) {
    case 'M':
      return { action: 'M', x, y }
    case 'L':
      return { action: 'L', x, y }
    case 'Q':
      return { action: 'Q', x1: num(values, 'svg:x1'), y1: num(values, 'svg:y1'), x, y }
    case 'C':
      return {
        action: 'C',
        x1: num(values, 'svg:x1'),
        y1: num(values, 'svg:y1'),
        x2: num(values, 'svg:x2'),
        y2: num(values, 'svg:y2'),
        x,
        y,
      }
    case 'A':
      return {
        action: 'A',
        rx: num(values, 'svg:rx'),
        ry: num(values, 'svg:ry'),
        rotate: values.has(KEY_ROTATE) ? num(values, KEY_ROTATE) : 0,
        largeArc: flag(values, KEY_LARGE_ARC),
        // librevenge's own SVG writer renders an absent sweep as 1; the files rely on it.
        sweep: values.has(KEY_SWEEP) ? flag(values, KEY_SWEEP) : true,
        x,
        y,
      }
    case 'Z':
      return { action: 'Z' }
    default:
      return null
  }
}

function parsePath(line: string, style: RawStyle): RawPath | null {
  const open = line.indexOf(PATH_OPEN)
  const close = line.lastIndexOf(PATH_CLOSE)
  if (open < 0 || close < open) return null
  const inner = line.slice(open + PATH_OPEN.length, close)
  const segments: RawSegment[] = []
  for (const group of inner.split(GROUP_SEPARATOR)) {
    const segment = parseSegment(group)
    if (segment) segments.push(segment)
  }
  return { style: { ...style }, segments }
}

export function parseRaw(text: string): RawDocument {
  const masters: RawMaster[] = []
  let current: RawMaster | null = null
  let style: RawStyle = EMPTY_STYLE

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trimStart()

    if (trimmed.startsWith(CALL_START_PAGE)) {
      if (masters.length >= MAX_MASTERS_PER_FILE) break
      const match = PAGE_START.exec(line)
      const index = masters.length
      const name = match?.[1]
      const named = name !== undefined && name.trim().length > 0
      current = {
        index,
        name: named ? name : `${UNTITLED_PREFIX} ${index + 1}`,
        named,
        widthIn: Number(match?.[3] ?? 0),
        heightIn: Number(match?.[2] ?? 0),
        paths: [],
        textObjects: 0,
        graphicObjects: 0,
      }
      style = EMPTY_STYLE
      continue
    }

    if (!current) continue

    if (trimmed.startsWith(CALL_END_PAGE)) {
      masters.push(current)
      current = null
    } else if (trimmed.startsWith(CALL_SET_STYLE)) {
      style = parseStyle(trimmed)
    } else if (trimmed.startsWith(CALL_DRAW_PATH)) {
      const path = parsePath(trimmed, style)
      if (path) current.paths.push(path)
    } else if (trimmed.startsWith(CALL_TEXT)) {
      current.textObjects += 1
    } else if (trimmed.startsWith(CALL_GRAPHIC)) {
      current.graphicObjects += 1
    }
  }

  return { masters }
}
