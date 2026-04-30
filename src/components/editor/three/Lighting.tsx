'use client'

import { useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { useShallow } from 'zustand/react/shallow'
import {
  useSunStore,
  selectSunDirection,
  selectSunColor,
  selectSunIntensity,
} from '@/modules/editor/state/sunStore'
import { usePresentationFlags } from '@/modules/editor/state/viewStore'

const SUN_DISTANCE = 80

export function Lighting() {
  const direction = useSunStore(useShallow(selectSunDirection))
  const color = useSunStore(useShallow(selectSunColor))
  const baseIntensity = useSunStore(selectSunIntensity)
  const flags = usePresentationFlags()
  const intensity = flags.dimmedLighting ? baseIntensity * 0.7 : baseIntensity
  const hemiIntensity = flags.dimmedLighting ? 0.4 : 0.55

  const { gl } = useThree()
  const shadowMapSize = useMemo(() => {
    const max = gl.capabilities.maxTextureSize ?? 2048
    return max < 2048 ? 1024 : 2048
  }, [gl])

  const sunPos: [number, number, number] = [
    direction[0] * SUN_DISTANCE,
    direction[1] * SUN_DISTANCE,
    direction[2] * SUN_DISTANCE,
  ]
  const sunColor = useMemo(
    () => new THREE.Color(color[0], color[1], color[2]),
    [color],
  )

  return (
    <>
      <hemisphereLight args={['#FFFFFF', '#A8C5DA', hemiIntensity]} />
      <directionalLight
        position={sunPos}
        color={sunColor}
        intensity={intensity}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
        shadow-camera-near={1}
        shadow-camera-far={300}
      />
      <directionalLight position={[-40, 30, -20]} color="#CEE7FF" intensity={0.3} />
    </>
  )
}
