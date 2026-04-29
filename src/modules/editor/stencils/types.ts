export type StencilCategory =
  | 'pool-shape'
  | 'interior-feature'
  | 'deck-house'
  | 'construction-symbol'
  | 'water-outdoor'

export type MeasurementBehavior =
  | 'pool-area-perimeter-gallons'
  | 'spa-area-perimeter-gallons'
  | 'bench-linear-feet'
  | 'shelf-area'
  | 'feature-count'
  | 'deck-area'
  | 'lanai-area'
  | 'coping-linear-feet'
  | 'deco-drain-linear-feet'
  | 'screen-area'
  | 'fence-linear-feet'
  | 'wall-linear-feet'
  | 'point-marker'
  | 'dimension-line'
  | 'none'

export type PricingBehavior =
  | 'pool-base'
  | 'spa-base'
  | 'feature-fixed'
  | 'feature-per-unit'
  | 'deck-per-sqft'
  | 'lanai-per-sqft'
  | 'coping-per-lf'
  | 'deco-drain-per-lf'
  | 'screen-per-sqft'
  | 'fence-per-lf'
  | 'wall-per-lf'
  | 'bench-per-lf'
  | 'none'

export type ExportVisibility = 'customer' | 'construction' | 'both' | 'none'

export type EditableProperty =
  | 'width'
  | 'height'
  | 'depth-shallow'
  | 'depth-deep'
  | 'rotation'
  | 'fill'
  | 'stroke'
  | 'material'
  | 'label'
  | 'count'
  | 'radius'
  | 'length'
  | 'note'

export interface Dimensions {
  width: number
  height: number
  unit: 'in' | 'ft'
}

export interface Stencil {
  id: string
  name: string
  category: StencilCategory
  defaultDimensions: Dimensions
  defaultFill: string
  defaultStroke: string
  measurementBehavior: MeasurementBehavior
  pricingBehavior: PricingBehavior
  exportVisibility: ExportVisibility
  affectsQuote: boolean
  onConstructionSheet: boolean
  editableProperties: EditableProperty[]
}
