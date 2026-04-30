import { describe, expect, it } from 'vitest'
import { INCHES_PER_FOOT, feet, inches } from '@/lib/three/units'

describe('three/units', () => {
  it('feet converts inches to feet', () => {
    expect(feet(12)).toBe(1)
    expect(feet(0)).toBe(0)
    expect(feet(60)).toBe(5)
  })

  it('inches converts feet to inches', () => {
    expect(inches(1)).toBe(12)
    expect(inches(0)).toBe(0)
    expect(inches(5)).toBe(60)
  })

  it('round-trips through the bridge', () => {
    expect(inches(feet(36))).toBe(36)
    expect(feet(inches(7))).toBe(7)
  })

  it('exposes the constant', () => {
    expect(INCHES_PER_FOOT).toBe(12)
  })
})
