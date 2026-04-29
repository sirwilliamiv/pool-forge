// Stencil catalog types — strongly typed via Prisma enums.
// The catalog is the seed source for the StencilDef DB table.

import {
  StencilCategory,
  MeasurementBehavior,
  PricingBehavior,
  ExportVisibility,
  EditableProperty,
  ShapeKind,
} from '@prisma/client'

export {
  StencilCategory,
  MeasurementBehavior,
  PricingBehavior,
  ExportVisibility,
  EditableProperty,
  ShapeKind,
}

export interface StencilDimensions {
  width: number
  height: number
  unit: 'in' | 'ft'
}

export interface Stencil {
  id: string
  name: string
  category: StencilCategory
  defaultDimensions: StencilDimensions
  defaultFill: string
  defaultStroke: string
  measurementBehavior: MeasurementBehavior
  pricingBehavior: PricingBehavior
  exportVisibility: ExportVisibility
  affectsQuote: boolean
  onConstructionSheet: boolean
  editableProperties: EditableProperty[]
  // Most stencils materialize as the generic STENCIL kind. The handful with
  // dedicated shape kinds (rectangle pool, decks, sun shelf, bench, spa)
  // override this so they get specific edit UI / measurement handling.
  shapeKind: ShapeKind
}
