import { describe, expect, it } from 'vitest'
import {
  poolFieldsSchema,
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


// One question, one answer. The form used to ask about the heater twice, once
// in a free-text box that changed no price and once in a checkbox that did, and
// the two halves of the same question were separately storable. Stored rows
// still disagree with themselves, so the reader is where they are reconciled.
describe('a stored row says one thing', () => {
  it('prices a heater that was named but never ticked', () => {
    // The exact shape a builder produced by filling the detailed field and
    // skipping the checkbox: a quote went out with no equipment on it.
    const pf = readPoolFields({ heaterSelection: 'Pentair MasterTemp 400', heaterSelected: false })
    expect(pf.heaterSelected).toBe(true)
    expect(pricingSelectionsFrom({ heaterSelection: 'Pentair MasterTemp 400' }).heaterSelected).toBe(
      true,
    )
  })

  it('prices a screen enclosure that was specced but never ticked', () => {
    expect(readPoolFields({ screenOption: '20/20 mesh mansard' }).screenSelected).toBe(true)
  })

  it('gives the proposal words to print when only the salt box was ticked', () => {
    // The proposal's Sanitization row rendered blank on a project with salt on.
    const pf = readPoolFields({ saltSystemSelected: true, sanitizationPackage: '' })
    expect(pf.sanitizationPackage).toBe('Salt system')
    expect(pf.saltSystemSelected).toBe(true)
  })

  it('prices salt when the written answer says salt', () => {
    const pf = readPoolFields({ sanitizationPackage: 'Salt chlorine generator' })
    expect(pf.saltSystemSelected).toBe(true)
    expect(pf.sanitizationPackage).toBe('Salt chlorine generator')
  })

  it('leaves a non-salt answer alone', () => {
    const pf = readPoolFields({ sanitizationPackage: 'Chlorine' })
    expect(pf.saltSystemSelected).toBe(false)
    expect(pf.sanitizationPackage).toBe('Chlorine')
  })

  it('drops a fixture spec when no lights are being sold', () => {
    // A count cannot be inferred from a model name, so the count wins here.
    const pf = readPoolFields({ lightingSelection: 'IntelliBrite 5G', lightingQuantity: 0 })
    expect(pf.lightingQuantity).toBe(0)
    expect(pf.lightingSelection).toBe('')
  })
})

// Depth belongs to the pool in the drawing. A second free-text copy on the
// project drove nothing, and let one pool report three different depths: the
// typed pair, the canvas geometry the proposal printed, and a checklist error
// demanding the depths the canvas already had.
describe('depth is not a project field', () => {
  it('has no depth keys in the schema', () => {
    expect(Object.keys(poolFieldsSchema.shape)).not.toContain('depthShallow')
    expect(Object.keys(poolFieldsSchema.shape)).not.toContain('depthDeep')
  })

  it('drops a legacy typed depth rather than carrying a second answer forward', () => {
    const pf = readPoolFields({ depthShallow: '3-6', depthDeep: '6-0', poolType: 'Rectangle' })
    expect(pf).not.toHaveProperty('depthShallow')
    expect(pf).not.toHaveProperty('depthDeep')
    expect(pf.poolType).toBe('Rectangle')
  })
})
