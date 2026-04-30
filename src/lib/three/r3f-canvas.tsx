'use client'

import dynamic from 'next/dynamic'

export const R3FCanvas = dynamic(
  () => import('@/components/editor/three/SceneCanvas').then((m) => m.SceneCanvas),
  { ssr: false },
)
