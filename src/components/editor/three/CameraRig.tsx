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
        // Pointed at the ground. A camera with no rotation looks down -Z, so
        // this was a camera hovering eighty feet up and staring at the horizon:
        // a side view from altitude, called Plan. It made the plan view show
        // decks edge-on as flat bars, and it made drawing in plan impossible,
        // because the ground plane every click is measured against was exactly
        // parallel to the ray doing the measuring.
        //
        // Rotating -90 degrees about X turns the view direction from (0,0,-1)
        // to (0,-1,0), and carries the camera's up vector to (0,0,-1), so world
        // +X is screen right and world +Z is screen down. That is the plan
        // convention, and it means a shape's stored x and y read the same way on
        // screen as they do in the data.
        rotation={[-Math.PI / 2, 0, 0]}
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
        // Looking back along -X toward the origin, for the same reason: without
        // this it looked along -Z and showed the front, not a section.
        rotation={[0, Math.PI / 2, 0]}
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
