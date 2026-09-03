'use server'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import type { Shape } from '@/modules/editor/state/shapes'

/**
 * The drawing behind one saved design, fetched on demand.
 *
 * The project page used to load every version's full `rootJson` up front to
 * render thumbnails, shipping up to forty drawings on first paint (and again on
 * every refresh) when the rack only ever draws about nine. The rack now asks
 * for a version's shapes as it scrolls to it, through this action.
 *
 * Org-scoped like every read: the version has to belong to the caller's
 * organisation AND to the named project, or the answer is an empty drawing
 * rather than someone else's design.
 */
export async function loadVersionShapes(projectId: string, versionId: string): Promise<Shape[]> {
  const session = await auth()
  const orgId = session?.user?.orgId
  if (!orgId) return []

  const row = await db.designVersion.findFirst({
    where: { id: versionId, projectId, orgId },
    select: { rootJson: true },
  })
  const shapes = (row?.rootJson as { shapes?: unknown } | null)?.shapes
  return Array.isArray(shapes) ? (shapes as Shape[]) : []
}
