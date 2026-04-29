export { useEditorStore } from './editorStore'
export type { ToolMode } from './editorStore'
export { useSelectionStore } from './selectionStore'
export { useHistoryStore } from './historyStore'
export type { HistorySnapshot } from './historyStore'
export { useShapesStore } from './shapesStore'
export { useSaveStatusStore } from './saveStore'
export type { SaveStatus } from './saveStore'
export {
  type Shape,
  type ShapeKind,
  type RectanglePool,
  type DeckShape,
  type FeatureShape,
  isPool,
  isDeck,
  isFeature,
  SHAPE_DEFAULTS,
} from './shapes'
