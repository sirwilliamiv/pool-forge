'use client'

import * as THREE from 'three'

export type MaterialId =
  | 'pebbletecBlueGranite'
  | 'travertineSilver'
  | 'glassMosaicAqua'
  | 'waterDefault'

export const pebbletecBlueGranite = new THREE.MeshStandardMaterial({
  color: '#1F3D6E',
  roughness: 0.45,
  metalness: 0.0,
})
pebbletecBlueGranite.name = 'pebbletecBlueGranite'

export const travertineSilver = new THREE.MeshStandardMaterial({
  color: '#D6CDB7',
  roughness: 0.7,
  metalness: 0.0,
})
travertineSilver.name = 'travertineSilver'

export const glassMosaicAqua = new THREE.MeshStandardMaterial({
  color: '#3FB6C9',
  roughness: 0.25,
  metalness: 0.15,
})
glassMosaicAqua.name = 'glassMosaicAqua'

export const waterDefault = new THREE.MeshPhysicalMaterial({
  color: '#38BDF8',
  transmission: 0.6,
  thickness: 0.5,
  ior: 1.33,
  clearcoat: 1.0,
  clearcoatRoughness: 0.05,
  roughness: 0.05,
  transparent: true,
  opacity: 0.9,
})
waterDefault.name = 'waterDefault'

const REGISTRY: Record<MaterialId, THREE.Material> = {
  pebbletecBlueGranite,
  travertineSilver,
  glassMosaicAqua,
  waterDefault,
}

export function getMaterial(id?: MaterialId | string): THREE.Material {
  if (id && id in REGISTRY) return REGISTRY[id as MaterialId]
  return pebbletecBlueGranite
}
