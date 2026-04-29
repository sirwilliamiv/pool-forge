import { describe, it } from 'vitest'

describe('pricing engine', () => {
  it.todo('pool quote line item recalculates when surface area changes')
  it.todo('pool quote line item uses wetted area × base pool rate formula')
  it.todo('deck quote recalculates when material changes (concrete → pavers)')
  it.todo('deck quote = deck area × selected deck material rate')
  it.todo('coping price = pool perimeter × coping rate')
  it.todo('bench price = bench linear feet × bench rate')
  it.todo('equipment line item appears when heater is selected')
  it.todo('equipment line item disappears when heater is deselected')
  it.todo('salt system price appears only when salt is selected')
  it.todo('screen price appears only when screen option is selected')
  it.todo('deco drain price = deco drain linear feet × drain rate')
  it.todo('commission = subtotal × commission rate')
  it.todo('upgrade-only line items hidden until explicitly added')
  it.todo('discounts applied after subtotal but before tax')
  it.todo('quote total reflects sum of all visible line items')
})
