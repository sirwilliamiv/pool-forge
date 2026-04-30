'use client'

import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useViewStore, usePresentationFlags } from '@/modules/editor/state/viewStore'

export function CameraRig() {
  const viewMode = useViewStore((s) => s.viewMode)
  const flags = usePresentationFlags()

  if (viewMode === 'plan' || flags.forceTopDown) {
    return (
      <OrthographicCamera
        makeDefault
        position={[0, 80, 0]}
        zoom={20}
        near={-200}
        far={500}
      />
    )
  }
  if (viewMode === 'section') {
    return (
      <OrthographicCamera
        makeDefault
        position={[60, 0, 0]}
        zoom={20}
        near={-200}
        far={500}
      />
    )
  }
  return (
    <PerspectiveCamera
      makeDefault
      position={[38, 39, -36]}
      fov={38}
      near={0.1}
      far={500}
    />
  )
}
