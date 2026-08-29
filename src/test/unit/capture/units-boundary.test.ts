// One conversion, in one place.
//
// ARKit works in metres, this codebase works in canvas inches and feet, and a
// survey that is 3.28 times too big is what happens when the constant is
// written out a second time somewhere convenient. So the rule is structural
// rather than a comment: `src/modules/capture/units.ts` is the only file in the
// capture module allowed to know what an inch is, and this test reads the
// source to prove it.
//
// A static test rather than a behavioural one because the failure it catches is
// a line someone adds in a hurry, and by the time it changes behaviour it is a
// wrong number on a quote.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { FEET_PER_METRE, INCHES_PER_METRE, metresToFeet, metresToInches } from '@/modules/capture/units'

const MODULE_DIR = 'src/modules/capture'
const BOUNDARY = 'units.ts'

/** Every way somebody might write the conversion out by hand. */
const SMUGGLED = [
  /3\.28/,
  /39\.37/,
  /0\.3048/,
  /0\.0254/,
  /25\.4/,
  /\bmetresTo\w+\s*=/,
]

function captureFiles(): string[] {
  return readdirSync(MODULE_DIR)
    .filter(name => name.endsWith('.ts') && name !== BOUNDARY)
    .map(name => join(MODULE_DIR, name))
}

describe('the metre boundary is a boundary', () => {
  it('finds the capture module at all', () => {
    // Guards the guard: an empty file list would make the sweep below pass
    // while checking nothing.
    expect(captureFiles().length).toBeGreaterThan(4)
  })

  it('has no file but units.ts that knows what an inch is', () => {
    const offenders: string[] = []
    for (const file of captureFiles()) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of SMUGGLED) {
        if (pattern.test(source)) offenders.push(`${file} contains ${String(pattern)}`)
      }
    }
    expect(offenders, `the conversion has leaked out of units.ts: ${offenders.join(', ')}`).toEqual(
      [],
    )
  })

  it('defines the inch exactly, and derives everything else from it', () => {
    // 25.4mm to the inch by definition, twelve inches to the foot. Both are
    // exact, so neither is allowed to be a rounded literal.
    expect(INCHES_PER_METRE * 0.0254).toBe(1)
    expect(FEET_PER_METRE * 12).toBe(INCHES_PER_METRE)
    expect(metresToInches(1)).toBe(INCHES_PER_METRE)
    expect(metresToFeet(1)).toBe(FEET_PER_METRE)
  })

  it('converts the numbers a builder would check by hand', () => {
    expect(metresToFeet(0.3048)).toBeCloseTo(1, 12)
    expect(metresToInches(2.54)).toBeCloseTo(100, 10)
    // A 30 by 20 metre yard is roughly 98 by 66 feet, which is a normal lot.
    expect(Math.round(metresToFeet(30))).toBe(98)
    expect(Math.round(metresToFeet(20))).toBe(66)
  })
})
