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

// --- Site context & object materials (shared singletons) -------------------

export const plasterShallow = new THREE.MeshStandardMaterial({
  color: 0x60a5fa,
  roughness: 0.4,
})
plasterShallow.name = 'plasterShallow'

export const spaBody = new THREE.MeshStandardMaterial({
  color: 0x1e40af,
  roughness: 0.4,
})
spaBody.name = 'spaBody'

export const spaSkirt = new THREE.MeshStandardMaterial({
  color: 0xa8a29e,
  roughness: 0.85,
})
spaSkirt.name = 'spaSkirt'

export const spaWaterPhysical = new THREE.MeshPhysicalMaterial({
  color: 0x60a5fa,
  transparent: true,
  opacity: 0.78,
  roughness: 0.05,
  transmission: 0.5,
  clearcoat: 1.0,
})
spaWaterPhysical.name = 'spaWaterPhysical'

export const spaCoping = new THREE.MeshStandardMaterial({
  color: 0xc9c2b0,
  roughness: 0.7,
})
spaCoping.name = 'spaCoping'

export const sunShelfWater = new THREE.MeshPhysicalMaterial({
  color: 0xbae6fd,
  transparent: true,
  opacity: 0.8,
  roughness: 0.05,
  transmission: 0.5,
  clearcoat: 1.0,
})
sunShelfWater.name = 'sunShelfWater'

export const bubblerStone = new THREE.MeshStandardMaterial({
  color: 0xa8a29e,
  roughness: 0.85,
})
bubblerStone.name = 'bubblerStone'

export const bubblerFountain = new THREE.MeshPhysicalMaterial({
  color: 0xbae6fd,
  transparent: true,
  opacity: 0.45,
  roughness: 0.1,
  transmission: 0.7,
})
bubblerFountain.name = 'bubblerFountain'

export const bubblerDroplet = new THREE.MeshPhysicalMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.6,
  roughness: 0.05,
  transmission: 0.6,
})
bubblerDroplet.name = 'bubblerDroplet'

export const ledRing = new THREE.MeshStandardMaterial({
  color: 0xf1f5f9,
  roughness: 0.4,
})
ledRing.name = 'ledRing'

export const ledGlow = new THREE.MeshBasicMaterial({ color: 0xfef9c3 })
ledGlow.name = 'ledGlow'

export const drainGrate = new THREE.MeshStandardMaterial({
  color: 0x6b7280,
  roughness: 0.6,
  metalness: 0.4,
})
drainGrate.name = 'drainGrate'

// Spillover spout has two variants — emissive when validation glow is active,
// neutral when the presentation mode hides validation chrome.
export const spilloverSpoutNeutral = new THREE.MeshStandardMaterial({
  color: 0x9ca3af,
})
spilloverSpoutNeutral.name = 'spilloverSpoutNeutral'

export const spilloverSpoutGlow = new THREE.MeshStandardMaterial({
  color: 0x9ca3af,
  emissive: 0xef4444,
  emissiveIntensity: 0.4,
})
spilloverSpoutGlow.name = 'spilloverSpoutGlow'

export const spilloverWater = new THREE.MeshPhysicalMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.7,
  roughness: 0.05,
  transmission: 0.6,
})
spilloverWater.name = 'spilloverWater'

export const concreteDeck = new THREE.MeshStandardMaterial({
  color: 0xd9d3c3,
  roughness: 0.85,
})
concreteDeck.name = 'concreteDeck'

export const houseWallStucco = new THREE.MeshStandardMaterial({
  color: 0xede8dc,
  roughness: 0.9,
})
houseWallStucco.name = 'houseWallStucco'

export const concretePad = new THREE.MeshStandardMaterial({
  color: 0xc8c2b5,
  roughness: 0.9,
})
concretePad.name = 'concretePad'

export const heaterMetal = new THREE.MeshStandardMaterial({
  color: 0x44403c,
  roughness: 0.6,
  metalness: 0.3,
})
heaterMetal.name = 'heaterMetal'

export const filterTank = new THREE.MeshStandardMaterial({
  color: 0x1f2937,
  roughness: 0.3,
})
filterTank.name = 'filterTank'

export const pumpHousing = new THREE.MeshStandardMaterial({
  color: 0x4b5563,
  roughness: 0.4,
  metalness: 0.4,
})
pumpHousing.name = 'pumpHousing'

export const treeBark = new THREE.MeshStandardMaterial({
  color: 0x6b4423,
  roughness: 0.95,
})
treeBark.name = 'treeBark'

export const treeFoliage = new THREE.MeshStandardMaterial({
  color: 0x4d7c3a,
  roughness: 0.9,
})
treeFoliage.name = 'treeFoliage'

export const treeFoliageAlt = new THREE.MeshStandardMaterial({
  color: 0x5e8c44,
  roughness: 0.9,
})
treeFoliageAlt.name = 'treeFoliageAlt'

export const loungerWood = new THREE.MeshStandardMaterial({
  color: 0x9c6b3f,
  roughness: 0.85,
})
loungerWood.name = 'loungerWood'

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
