import { describe, expect, it } from 'vitest'
import {
  pricingSelectionsFrom,
  readPoolFields,
  validationSelectionsFrom,
} from '@/modules/projects/pool-fields'

describe('readPoolFields', () => {
  it('fills defaults for missing and non-object input', () => {
    for (const input of [null, undefined, 'nope', [], {}]) {
      const pf = readPoolFields(input)
      expect(pf.heaterSelected).toBe(false)
      expect(pf.lightingQuantity).toBe(0)
      expect(pf.interiorFinish).toBe('')
    }
  })

  it('accepts the legacy string/number encodings of the booleans', () => {
    const pf = readPoolFields({
      heaterSelected: 'true',
      saltSystemSelected: 1,
      screenSelected: 'false',
      lightingQuantity: '4',
    })
    expect(pf.heaterSelected).toBe(true)
    expect(pf.saltSystemSelected).toBe(true)
    expect(pf.screenSelected).toBe(false)
    expect(pf.lightingQuantity).toBe(4)
  })

  it('keeps a bad field from throwing out the whole row', () => {
    const pf = readPoolFields({ interiorFinish: 'Pebble', lightingQuantity: 'abc' })
    expect(pf.interiorFinish).toBe('Pebble')
    expect(pf.lightingQuantity).toBe(0)
  })
})

describe('selection views', () => {
  const source = {
    heaterSelected: true,
    saltSystemSelected: true,
    screenSelected: false,
    lightingQuantity: 3,
  }

  it('maps pricing selections straight through', () => {
    expect(pricingSelectionsFrom(source)).toEqual({
      heaterSelected: true,
      saltSystemSelected: true,
      screenSelected: false,
      lightingQuantity: 3,
    })
  })

  // The validation engine calls the same selection `saltSelected`; this rename
  // is the only place the two vocabularies are allowed to meet.
  it('renames saltSystemSelected for the validation engine', () => {
    expect(validationSelectionsFrom(source)).toEqual({
      heaterSelected: true,
      saltSelected: true,
      screenSelected: false,
      lightingQuantity: 3,
    })
  })
})
