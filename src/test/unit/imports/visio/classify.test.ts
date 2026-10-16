import { ShapeKind, StencilCategory } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { classifyMaster } from '@/modules/imports/visio/classify'

describe('classifyMaster', () => {
  it.each([
    ['Standard Rectangle', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Freeform Kidney 11', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Grecian Master', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Round Corners', 'Pool.vss', StencilCategory.POOL_SHAPE, ShapeKind.POLYGON_POOL],
    ['Standard Steps', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Tan Ledge 5x5', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Swim Out Bench', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Bubbler', 'Pool.vss', StencilCategory.INTERIOR_FEATURE, ShapeKind.SKETCH_PATH],
    ['Guard Alarm', 'Pool.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['Drains', 'Pool.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['Call Out', 'Pool.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['6X6 Spa.39', 'Spa.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SPA],
    ["6'x6' Grecian Spa", 'Spa.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SPA],
    ["Spillway 4'", 'Spa.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SKETCH_PATH],
    ["2'Waterfall", 'Pool.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SKETCH_PATH],
    ['36" Copper Fire Bowl', 'House&Deck.vss', StencilCategory.WATER_OUTDOOR, ShapeKind.SKETCH_PATH],
    ['House', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.SKETCH_PATH],
    ['Grass', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.GRASS_AREA],
    ['Concrete Lanai', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.CONCRETE_DECK],
    ['Paver Lanai', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.PAVER_DECK],
    ["Raised Deck 6'", 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.CONCRETE_DECK],
    ['Pillar', 'House&Deck.vss', StencilCategory.DECK_HOUSE, ShapeKind.SKETCH_PATH],
    ['Child Safety Fence', 'House&Deck.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
    ['Untitled master 3', 'Anything.vss', StencilCategory.CONSTRUCTION_SYMBOL, ShapeKind.SKETCH_PATH],
  ])('%s in %s', (name, file, category, kind) => {
    expect(classifyMaster(name, file)).toEqual({ category, shapeKind: kind })
  })
})
