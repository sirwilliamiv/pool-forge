'use client'

export function Ground() {
  return (
    <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -2, 0]}>
      <planeGeometry args={[400, 400]} />
      <meshStandardMaterial color="#EEF2F4" roughness={0.95} />
    </mesh>
  )
}
