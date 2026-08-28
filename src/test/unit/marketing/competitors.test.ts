// Facts about other companies, checked before they go on a public page.
//
// These records feed pages that name rivals. A wrong entry is not a bug, it is
// a false public statement about somebody else's product, so the tests here are
// less about behaviour than about the discipline: nothing unsourced, nothing
// undated, and no blank that renders as a cross.

import { describe, expect, it } from 'vitest'

import {
  ALL_PRODUCTS,
  COMPETITORS,
  FEATURES,
  POOL_FORGE,
  capabilityOf,
  productBySlug,
  uncontestedFeatures,
} from '@/modules/marketing/competitors'

describe('every product record', () => {
  it('says where it came from and when it was checked', () => {
    for (const product of ALL_PRODUCTS) {
      expect(product.site, product.name).toMatch(/^https:\/\//)
      expect(product.verified, product.name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('has a unique slug, because a page is addressed by it', () => {
    const slugs = ALL_PRODUCTS.map(p => p.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('says something honest about where a rival wins', () => {
    // A comparison where the competitor has no strengths is one nobody
    // believes, and a builder who has used the other tool stops reading.
    for (const rival of COMPETITORS) {
      expect(rival.strengths.length, rival.name).toBeGreaterThan(0)
    }
  })

  it('admits where we fall short', () => {
    expect(POOL_FORGE.gaps.length).toBeGreaterThan(0)
    expect(POOL_FORGE.gaps.join(' ')).toMatch(/photoreal/i)
  })
})

describe('what we claim about ourselves', () => {
  // The record is read by a stranger deciding whether to trust the product.
  // Anything in flight must read as not done until it ships.
  it('does not claim the things that are still being built', () => {
    expect(capabilityOf(POOL_FORGE, 'financing').support).toBe('no')
    expect(capabilityOf(POOL_FORGE, 'scheduling').support).toBe('no')
    expect(capabilityOf(POOL_FORGE, 'photoreal').support).toBe('no')
    // Screens unfinished, so not a yes.
    expect(capabilityOf(POOL_FORGE, 'changeApproval').support).toBe('partial')
    expect(capabilityOf(POOL_FORGE, 'teamRoles').support).toBe('partial')
  })

  it('claims the thing that is actually true and actually rare', () => {
    expect(capabilityOf(POOL_FORGE, 'priceFromDrawing').support).toBe('yes')
    expect(uncontestedFeatures().map(f => f.key)).toContain('priceFromDrawing')
  })
})

describe('a feature nobody researched', () => {
  it('comes back unknown rather than absent', () => {
    // The whole point. A missing key must never render as a cross next to a
    // named company.
    const invented = { ...POOL_FORGE, capabilities: {} }
    expect(capabilityOf(invented, 'financing').support).toBe('unknown')
  })

  it('is never silently treated as a no', () => {
    for (const product of ALL_PRODUCTS) {
      for (const feature of FEATURES) {
        expect(['yes', 'partial', 'no', 'unknown']).toContain(capabilityOf(product, feature.key).support)
      }
    }
  })
})

describe('looking a product up', () => {
  it('finds one by slug and returns nothing for a stranger', () => {
    expect(productBySlug('prodbx')?.name).toBe('ProDBX')
    expect(productBySlug('not-a-product')).toBeUndefined()
  })
})
