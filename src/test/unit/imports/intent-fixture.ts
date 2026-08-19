import {
  emptyDesignIntent,
  type DesignIntent,
  type Footprint,
} from '@/modules/imports/intent'
import type { ImportSessionView, ProjectView } from '@/components/imports/types'
import { emptyStages } from '@/components/imports/types'

/** A 32 ft by 16 ft rectangle in intent-frame inches. */
export const RECT_FOOTPRINT: Footprint = {
  points: [
    { x: 0, y: 0 },
    { x: 384, y: 0 },
    { x: 384, y: 192 },
    { x: 0, y: 192 },
  ],
}

export function reviewableIntent(overrides: Partial<DesignIntent> = {}): DesignIntent {
  const base = emptyDesignIntent(['img_1'])
  const intent: DesignIntent = {
    ...base,
    pool: {
      footprint: RECT_FOOTPRINT,
      shapeFamily: 'rectangle',
      lengthFt: 32,
      widthFt: 16,
      depthShallowFt: 3,
      depthDeepFt: 6,
    },
    features: [
      {
        stencilId: 'spa',
        label: 'Spa',
        lengthFt: 7,
        widthFt: 7,
        count: 1,
        x: 300,
        y: 20,
      },
      {
        stencilId: null,
        label: 'Sun shelf',
        lengthFt: 8,
        widthFt: 4,
        count: 2,
        x: 20,
        y: 20,
      },
    ],
    deck: { footprint: null, material: 'paver', widthFt: 6 },
    scale: { pixelsPerInch: 4, method: 'grid', confidence: 0.9 },
    fieldConfidence: {
      'pool.lengthFt': 0.92,
      'pool.widthFt': 0.72,
      'pool.depthDeepFt': 0.41,
      'deck.material': 0.55,
    },
    warnings: [],
  }
  return { ...intent, ...overrides }
}

export function sessionView(
  intent: DesignIntent,
  overrides: Partial<ImportSessionView> = {},
): ImportSessionView {
  return {
    id: 'session_1',
    status: 'DRAFT',
    intent,
    touchedFieldPaths: [],
    images: [
      {
        id: 'img_1',
        label: 'Sketch 1',
        kindLabel: 'Sketch',
        widthPx: 1600,
        heightPx: 1200,
        stages: emptyStages(),
      },
    ],
    appliedAtLabel: null,
    ...overrides,
  }
}

export const PROJECT: ProjectView = { id: 'project_1', name: 'Rivera residence' }
