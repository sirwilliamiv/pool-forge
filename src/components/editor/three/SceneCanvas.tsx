'use client'

import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { CameraRig } from './CameraRig'
import { CommentPins } from './CommentPins'
import { CustomOrbit } from './CustomOrbit'
import { DragHandler } from './DragHandler'
import { Ground } from './Ground'
import { Lighting } from './Lighting'
import { RevealNewShapes } from './RevealNewShapes'
import { SatelliteUnderlay } from './objects/SatelliteUnderlay'
import { SceneRoot } from './SceneRoot'
import { SketchGestures } from './SketchGestures'
import { SelectionHalo } from './SelectionHalo'
import { SelectionHandles } from './SelectionHandles'
import { SelectionLabel } from './SelectionLabel'
import { SelectionPicker } from './SelectionPicker'
import { ToolGestures } from './ToolGestures'

export function SceneCanvas({ projectId }: { projectId?: string | undefined }) {
  return (
    <Canvas
      shadows
      className="h-full w-full"
      gl={{ outputColorSpace: THREE.SRGBColorSpace, antialias: true }}
    >
      <color attach="background" args={['#EEF2F4']} />
      <fog attach="fog" args={['#EEF2F4', 80, 200]} />
      <CameraRig />
      <CustomOrbit />
      <Lighting />
      <Ground />
      {/* Between the base plane and the grid; one scene, so the backdrop shows
          in the plan (ortho) and 3D (perspective) views alike. */}
      <SatelliteUnderlay projectId={projectId} />
      <SceneRoot />
      <RevealNewShapes />
      <DragHandler />
      <SelectionPicker />
      <SelectionHalo />
      <SelectionHandles />
      <SelectionLabel />
      <ToolGestures />
      <SketchGestures />
      <CommentPins />
    </Canvas>
  )
}
