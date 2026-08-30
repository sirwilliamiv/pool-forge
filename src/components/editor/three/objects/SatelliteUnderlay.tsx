'use client'

import { useEffect, useState } from 'react'
import * as THREE from 'three'

import { feet } from '@/lib/three/units'
import { useSurveyStore } from '@/modules/editor/state/surveyStore'

/**
 * The satellite backdrop under the drawing.
 *
 * A textured plane sized from the survey's inch dimensions, so the photo is at
 * true scale: a fence that measures forty feet on the ground measures forty
 * feet under the grid. The image itself is never stored (Google ToS); the
 * survey carries `{lat, lng, zoom, px}` and this component re-fetches the
 * tiles through the authenticated proxy at view time. The session cookie rides
 * along, so a plain texture URL is enough.
 *
 * Placement: shape x/y are top-left in canvas inches, world is x east /
 * z south / y up, and a north-up image maps directly onto those axes. The
 * plane sits at y=-1: above Ground's base plane (y=-2), below the grids
 * (y≈0.01), so it z-fights neither.
 *
 * `raycast` is a no-op so the backdrop never swallows a pointer event meant
 * for drawing or selection; it is reference, not geometry.
 */
export function SatelliteUnderlay({ projectId }: { projectId?: string | undefined }) {
  const survey = useSurveyStore((s) => s.survey)
  const geo = survey?.geo

  const url =
    projectId && geo
      ? `/api/projects/${projectId}/satellite?zoom=${geo.zoom}&w=${geo.mapWidthPx}&h=${geo.mapHeightPx}`
      : null

  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!url) {
      setTexture(null)
      return
    }
    let cancelled = false
    let loaded: THREE.Texture | null = null
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        if (cancelled) {
          tex.dispose()
          return
        }
        tex.colorSpace = THREE.SRGBColorSpace
        // The photo is viewed at grazing angles in 3D; without anisotropy it
        // smears into mush a few feet from the camera.
        tex.anisotropy = 8
        loaded = tex
        setTexture(tex)
      },
      undefined,
      () => {
        // Load failure (key missing server-side, network, revoked session):
        // render nothing rather than a broken plane. The import affordance is
        // where the failure gets words; the canvas just stays clean.
        if (!cancelled) setTexture(null)
      },
    )
    return () => {
      cancelled = true
      loaded?.dispose()
      setTexture(null)
    }
  }, [url])

  if (!survey || !geo || !texture) return null

  const width = feet(survey.widthInches)
  const height = feet(survey.heightInches)
  // Top-left inches to the plane's centre in world feet.
  const centreX = feet(survey.x + survey.widthInches / 2)
  const centreZ = feet(survey.y + survey.heightInches / 2)

  return (
    <mesh
      name="satellite-underlay"
      raycast={() => null}
      rotation-x={-Math.PI / 2}
      position={[centreX, -1, centreZ]}
    >
      <planeGeometry args={[width, height]} />
      {/* Basic, not standard: a photograph should not be re-lit by the scene's
          sun, and must not darken when the sun dial swings to evening. */}
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={survey.opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
