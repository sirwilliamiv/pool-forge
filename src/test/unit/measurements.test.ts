import { describe, it } from 'vitest'

describe('measurement engine', () => {
  it.todo('rectangle pool area: width × length matches expected sq ft')
  it.todo('rectangle pool perimeter: 2 × (width + length)')
  it.todo('resize-by-target-area scales shape proportionally and updates area, perimeter, length, width, gallons')
  it.todo('resize-by-target-area warns when target cannot be achieved cleanly')
  it.todo('deck area calculation excludes pool footprint')
  it.todo('coping linear feet equals pool perimeter')
  it.todo('deco drain linear feet matches drawn drain segments')
  it.todo('lanai area + deck area composes correctly when both present')
  it.todo('wetted area accounts for shallow + deep depth zones')
  it.todo('gallons = wetted area × average depth × 7.48')
  it.todo('bench linear feet measured along drawn bench edges')
  it.todo('screen square footage measured for screen cage stencils')
  it.todo('feature counts increment when features are added and decrement when removed')
  it.todo('rotating a shape updates angle but preserves area and perimeter')
  it.todo('copying a shape preserves dimensions and pricing tags')
})
