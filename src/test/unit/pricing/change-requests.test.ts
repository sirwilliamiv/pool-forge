// Proposing a price change and having somebody review it.
//
// The case this is built for: a salesperson needs travertine coping raised, the
// keeper is the only one who may change the list, and by the time they look at
// it somebody else may have already touched the same line.

import { PriceCategory, PriceChangeKind, UnitType } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  applyRequest,
  canApprove,
  changeSchema,
  diffRequest,
  type BookItem,
  type ProposedChange,
} from '@/modules/pricing/change-requests'

const POOL: BookItem = {
  id: 'item-pool', name: 'Pool base', category: PriceCategory.POOL,
  unitType: UnitType.SQFT, retailPrice: 85, unitCost: 48, required: true,
}
const COPING: BookItem = {
  id: 'item-coping', name: 'Travertine coping', category: PriceCategory.COPING,
  unitType: UnitType.LF, retailPrice: 42, unitCost: 22,
}
const BOOK = [POOL, COPING]
const recorded = new Map(BOOK.map(i => [i.id, i]))

const raiseCoping: ProposedChange = {
  kind: PriceChangeKind.UPDATE,
  itemId: 'item-coping',
  after: { ...COPING, retailPrice: 48 },
  reason: 'Supplier went up in March',
}

describe('what a reviewer is shown', () => {
  it('shows what it was and what it would become', () => {
    const diff = diffRequest(BOOK, recorded, [raiseCoping])
    expect(diff.lines[0]?.before?.retailPrice).toBe(42)
    expect(diff.lines[0]?.after?.retailPrice).toBe(48)
    expect(diff.lines[0]?.reason).toBe('Supplier went up in March')
    expect(diff.summary).toEqual({ added: 0, changed: 1, removed: 0 })
  })

  it('names the line, never an id', () => {
    const diff = diffRequest(BOOK, recorded, [raiseCoping])
    expect(diff.lines[0]?.label).toBe('Travertine coping')
    expect(JSON.stringify(diff.lines[0]?.label)).not.toMatch(/item-/)
  })
})

describe('when the list moved underneath the request', () => {
  it('flags a line somebody else already changed', () => {
    // The keeper raised coping to 45 while the request sat. Applying it blindly
    // would quietly undo that.
    const movedOn = [POOL, { ...COPING, retailPrice: 45 }]
    const diff = diffRequest(movedOn, recorded, [raiseCoping])
    expect(diff.lines[0]?.conflict).toBe('moved')
    expect(diff.conflicts).toHaveLength(1)
  })

  it('flags a line that has since been deleted', () => {
    const diff = diffRequest([POOL], recorded, [raiseCoping])
    expect(diff.lines[0]?.conflict).toBe('gone')
  })

  it('says nothing when the line is untouched', () => {
    expect(diffRequest(BOOK, recorded, [raiseCoping]).conflicts).toEqual([])
  })

  it('does not call an addition a conflict', () => {
    const add: ProposedChange = {
      kind: PriceChangeKind.ADD,
      after: { name: 'Sun shelf', category: PriceCategory.POOL, unitType: UnitType.SQFT, retailPrice: 60 },
    }
    expect(diffRequest(BOOK, recorded, [add]).conflicts).toEqual([])
  })
})

describe('what approving produces', () => {
  it('changes only the line it was about', () => {
    const { items } = applyRequest(BOOK, [raiseCoping])
    expect(items.find(i => i.name === 'Travertine coping')?.retailPrice).toBe(48)
    expect(items.find(i => i.name === 'Pool base')?.retailPrice).toBe(85)
    expect(items).toHaveLength(2)
  })

  it('keeps the flags that were not part of the request', () => {
    const { items } = applyRequest(BOOK, [raiseCoping])
    expect(items.find(i => i.name === 'Pool base')?.required).toBe(true)
  })

  it('adds and removes', () => {
    const changes: ProposedChange[] = [
      { kind: PriceChangeKind.REMOVE, itemId: 'item-pool' },
      {
        kind: PriceChangeKind.ADD,
        after: { name: 'Spa shell', category: PriceCategory.SPA, unitType: UnitType.EACH, retailPrice: 9_500 },
      },
    ]
    const { items } = applyRequest(BOOK, changes)
    expect(items.map(i => i.name).sort()).toEqual(['Spa shell', 'Travertine coping'])
  })

  it('is the same answer the reviewer was shown', () => {
    // One function answers both questions, so nobody can be shown one thing and
    // get another.
    const diff = diffRequest(BOOK, recorded, [raiseCoping])
    const { items } = applyRequest(BOOK, [raiseCoping])
    expect(items.find(i => i.name === diff.lines[0]?.label)?.retailPrice).toBe(diff.lines[0]?.after?.retailPrice)
  })
})

describe('what a request is allowed to say', () => {
  it('refuses a price a price cannot be', () => {
    const bad = changeSchema.safeParse({
      kind: PriceChangeKind.UPDATE, itemId: 'item-coping',
      after: { ...COPING, retailPrice: -5 },
    })
    expect(bad.success).toBe(false)
    expect(JSON.stringify(bad)).toMatch(/negative/)
  })

  it('refuses an absurd price, the way the importer does', () => {
    const bad = changeSchema.safeParse({
      kind: PriceChangeKind.UPDATE, itemId: 'item-coping',
      after: { ...COPING, retailPrice: 5e9 },
    })
    expect(bad.success).toBe(false)
  })

  it('refuses a change that does not say which line', () => {
    expect(changeSchema.safeParse({ kind: PriceChangeKind.UPDATE, after: COPING }).success).toBe(false)
  })

  it('refuses an addition with no details', () => {
    expect(changeSchema.safeParse({ kind: PriceChangeKind.ADD }).success).toBe(false)
  })
})

describe('who may publish', () => {
  it('is the keeper, not whoever asked', () => {
    expect(canApprove('OWNER')).toBe(true)
    expect(canApprove('ADMIN')).toBe(true)
    expect(canApprove('MEMBER')).toBe(false)
    expect(canApprove(null)).toBe(false)
    expect(canApprove(undefined)).toBe(false)
  })
})
