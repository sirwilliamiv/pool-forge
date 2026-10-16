// What a stencil dropped on the canvas turns into.
//
// Pure, so the maths and the routing are tested without a WebGL context. The
// component that catches the drop only finds the ground point and dispatches
// whatever this returns.

import { inches } from '@/lib/three/units'
import {
  DROP_COMMAND,
  dropTopLeft,
  type StencilDragPayload,
  StencilDragSource,
} from '@/modules/editor/interactions/stencil-drag'

export interface DropPlan {
  command: 'add.shape' | 'stencil.library.place'
  input: { stencilId?: string; orgStencilId?: string; x: number; y: number }
}

/** Says the drop has nowhere to land: the camera is looking along the ground. */
export const NO_GROUND = 'no-ground'

/** Null when the payload is not a stencil drag. Ground is in world feet (x, z); the plan is in inches. */
export function planDrop(
  payload: StencilDragPayload | null,
  groundFt: { x: number; z: number } | null,
): DropPlan | typeof NO_GROUND | null {
  if (!payload) return null
  if (!groundFt) return NO_GROUND
  const { x, y } = dropTopLeft(
    { x: inches(groundFt.x), y: inches(groundFt.z) },
    payload.widthIn,
    payload.heightIn,
  )
  const input: DropPlan['input'] = { x, y }
  if (payload.source === StencilDragSource.LIBRARY) input.orgStencilId = payload.id
  else input.stencilId = payload.id
  return { command: DROP_COMMAND[payload.source], input }
}
