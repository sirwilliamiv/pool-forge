import { describe, it, expect } from 'vitest'
import { COMMAND_CATEGORIES } from '@/modules/commands/registry'
import { CATEGORY_ORDER } from '@/components/docs/CommandList'

describe('docs page categories', () => {
  it('orders every command category', () => {
    // CATEGORY_ORDER must cover CommandCategory exactly.
    expect([...CATEGORY_ORDER].sort()).toEqual([...COMMAND_CATEGORIES].sort())
  })
})
