import { describe, expect, it } from 'vitest'
import { parseDimension, parseDimensionToInches, parseScaleLegend } from '@/modules/imports/vision'
import { findJsonObject, parseModelJson, stripCodeFences } from '@/modules/imports/vision/json'
import { fixture } from './helpers'

describe('parseDimension', () => {
  it.each([
    ["32'", 384],
    ['32 ft', 384],
    ['32 feet', 384],
    ["32'-6\"", 390],
    ["32' 6\"", 390],
    ['6"', 6],
    ['6 in', 6],
    ['0.5 m', 19.6850393],
    ['150 cm', 59.0551181],
    ['2 yd', 72],
    ["L = 24'", 288],
    ["~ 24'", 288],
    ['1,200 in', 1200],
  ])('parses %s', (text, expected) => {
    const inches = parseDimensionToInches(text)
    expect(inches).not.toBeNull()
    expect(inches ?? 0).toBeCloseTo(expected, 4)
  })

  it.each(['about thirty-ish', '', 'TBD', '12 x 24', 'four feet', "-5'", '0 ft'])(
    'refuses to guess at %s',
    (text) => {
      expect(parseDimensionToInches(text, { defaultUnit: 'ft' })).toBeNull()
    },
  )

  it('leaves a bare number unparsed when no default unit is supplied', () => {
    const result = parseDimension('14')
    expect(result.inches).toBeNull()
    expect(result.reason).toContain('no unit')
  })

  it('applies a default unit to a bare number and says that it did', () => {
    const result = parseDimension('14', { defaultUnit: 'ft' })
    expect(result.inches).toBe(168)
    expect(result.assumedUnit).toBe(true)
  })
})

describe('parseScaleLegend', () => {
  it.each([
    ['1 square = 1 ft', 1, 'ft'],
    ['1 sq = 2\'', 2, 'ft'],
    ['each box = 6"', 6, 'in'],
    ['1 grid square = 0.5 m', 0.5, 'm'],
    ['2 squares = 1 ft', 0.5, 'ft'],
  ])('reads %s', (text, units, unit) => {
    const parsed = parseScaleLegend(text)
    expect(parsed).not.toBeNull()
    expect(parsed?.unitsPerSquare).toBeCloseTo(units, 6)
    expect(parsed?.unit).toBe(unit)
  })

  it.each(['scale as shown', '1" = 20\'', 'not to scale'])('returns null for %s', (text) => {
    expect(parseScaleLegend(text)).toBeNull()
  })
})

describe('parseModelJson', () => {
  it('reads a plain object', () => {
    const result = parseModelJson(fixture('sketch-good'))
    expect(result.ok).toBe(true)
  })

  it('unwraps markdown fences', () => {
    const raw = fixture('sketch-fenced')
    expect(raw.trimStart().startsWith('```')).toBe(true)
    const result = parseModelJson(raw)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.shapeFamily).toBe('oval')
  })

  it('finds an object behind conversational preamble', () => {
    const result = parseModelJson(fixture('concept-render-with-dimensions'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.shapeFamily).toBe('rectangle')
  })

  it('reports a truncated response rather than throwing', () => {
    const result = parseModelJson(fixture('sketch-truncated'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unterminated')
  })

  it('accepts an empty object as valid JSON, leaving Zod to reject it', () => {
    const result = parseModelJson(fixture('empty-object'))
    expect(result.ok).toBe(true)
    if (result.ok) expect(Object.keys(result.value)).toHaveLength(0)
  })

  it.each([
    ['', 'empty'],
    ['I cannot analyze this image.', 'no-object-found'],
    ['{ "a": }', 'invalid-json'],
    ['[1, 2, 3]', 'no-object-found'],
  ])('rejects %s', (raw, reason) => {
    const result = parseModelJson(raw)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it('is not fooled by a brace inside a string value', () => {
    const found = findJsonObject('{"note":"a } brace","ok":true}')
    expect(found?.terminated).toBe(true)
    expect(found?.text).toBe('{"note":"a } brace","ok":true}')
  })

  it('strips fences without a language tag', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
})
