// Integration test: hits the real local Postgres (`pnpm db:up`). Prisma is not
// mocked, per repo convention.
//
// Many designs for one job. Builders draw several before anybody agrees on one,
// and customers will draw their own through a share link.
//
// The behaviours worth pinning are the ones that lose work when they are wrong:
// opening a design must not throw away unsaved drawing, deleting must not leave
// the editor holding a drawing no card describes, and none of it may reach
// across organisations.

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { db } from '@/lib/db'
import {
  MAX_VERSIONS_PER_PROJECT,
  activateVersion,
  deleteVersion,
  listVersions,
  renameVersion,
  saveVersion,
} from '@/modules/versions'

const RUN = randomUUID().slice(0, 8)

let reachable = false
try {
  await db.$queryRaw`SELECT 1`
  reachable = true
} catch {
  console.warn('design version tests skipped: local Postgres unreachable. Run `pnpm db:up`.')
}

/** A drawing payload with a recognisable number of shapes. */
function drawing(count: number) {
  return {
    shapes: Array.from({ length: count }, (_, i) => ({
      id: `shape-${i}`,
      kind: 'STENCIL',
      x: i * 12,
      y: 0,
      width: 120,
      height: 120,
      zIndex: i,
      stencilId: 'pool.rectangle',
    })),
    survey: null,
  }
}

describe.skipIf(!reachable)('design versions', () => {
  let orgA = ''
  let orgB = ''
  let projectA = ''
  let projectB = ''

  beforeAll(async () => {
    orgA = (await db.organization.create({ data: { name: `Versions A ${RUN}` } })).id
    orgB = (await db.organization.create({ data: { name: `Versions B ${RUN}` } })).id
  })

  afterAll(async () => {
    if (!reachable) return
    await db.organization.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } })
  })

  beforeEach(async () => {
    await db.project.deleteMany({ where: { orgId: { in: [orgA, orgB] } } })
    projectA = (
      await db.project.create({ data: { orgId: orgA, name: `Job A ${RUN}` }, select: { id: true } })
    ).id
    projectB = (
      await db.project.create({ data: { orgId: orgB, name: `Job B ${RUN}` }, select: { id: true } })
    ).id
    await db.drawing.create({ data: { projectId: projectA, scale: 1, rootJson: drawing(3) } })
  })

  it('saves the working drawing as a named design', async () => {
    const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Raised spa' })
    expect(version.name).toBe('Raised spa')
    expect(version.source).toBe('BUILDER')

    const stored = await db.designVersion.findUnique({
      where: { id: version.id },
      select: { rootJson: true },
    })
    expect((stored?.rootJson as { shapes: unknown[] }).shapes).toHaveLength(3)
  })

  it('records a customer design as the customer\'s, with their typed name', async () => {
    const version = await saveVersion({
      orgId: orgA,
      projectId: projectA,
      name: 'What we actually want',
      source: 'CUSTOMER',
      createdByName: 'Paige',
      rootJson: drawing(1),
    })
    expect(version.source).toBe('CUSTOMER')
    expect(version.authorName).toBe('Paige')
  })

  it('lists designs oldest first, which is the order they were tried in', async () => {
    await saveVersion({ orgId: orgA, projectId: projectA, name: 'One' })
    await saveVersion({ orgId: orgA, projectId: projectA, name: 'Two' })
    const list = await listVersions(orgA, projectA)
    expect(list.map(v => v.name)).toEqual(['One', 'Two'])
  })

  it('opens a design by copying it into the working drawing', async () => {
    const one = await saveVersion({
      orgId: orgA,
      projectId: projectA,
      name: 'One',
      rootJson: drawing(1),
    })
    await saveVersion({ orgId: orgA, projectId: projectA, name: 'Two', rootJson: drawing(7) })

    await activateVersion(orgA, projectA, one.id)

    const working = await db.drawing.findUnique({
      where: { projectId: projectA },
      select: { rootJson: true },
    })
    expect((working?.rootJson as { shapes: unknown[] }).shapes).toHaveLength(1)

    const project = await db.project.findUnique({
      where: { id: projectA },
      select: { activeVersionId: true },
    })
    expect(project?.activeVersionId).toBe(one.id)
  })

  // The difference between a version rack and a trap. Somebody draws for an
  // hour without saving, clicks another design to compare, and their hour is
  // gone unless this keeps it.
  it('keeps unsaved work before opening a different design', async () => {
    const saved = await saveVersion({
      orgId: orgA,
      projectId: projectA,
      name: 'Saved one',
      rootJson: drawing(9),
    })
    // The working drawing still holds its own three shapes, belonging to no
    // version, because nothing has been opened yet.
    await activateVersion(orgA, projectA, saved.id)

    const list = await listVersions(orgA, projectA)
    const kept = list.find(v => v.name.startsWith('Unsaved work'))
    expect(kept).toBeDefined()

    const keptRow = await db.designVersion.findUnique({
      where: { id: kept?.id ?? '' },
      select: { rootJson: true },
    })
    expect((keptRow?.rootJson as { shapes: unknown[] }).shapes).toHaveLength(3)
  })

  it('does not keep an empty drawing as a design', async () => {
    await db.drawing.update({
      where: { projectId: projectA },
      data: { rootJson: { shapes: [], survey: null } },
    })
    const saved = await saveVersion({
      orgId: orgA,
      projectId: projectA,
      name: 'Only one',
      rootJson: drawing(2),
    })
    await activateVersion(orgA, projectA, saved.id)

    const list = await listVersions(orgA, projectA)
    expect(list.filter(v => v.name.startsWith('Unsaved work'))).toHaveLength(0)
  })

  it('marks exactly one design as open', async () => {
    const one = await saveVersion({ orgId: orgA, projectId: projectA, name: 'One' })
    const two = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Two' })
    await activateVersion(orgA, projectA, one.id)
    await activateVersion(orgA, projectA, two.id)

    const list = await listVersions(orgA, projectA)
    expect(list.filter(v => v.isActive).map(v => v.id)).toEqual([two.id])
  })

  it('renames a design', async () => {
    const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'One' })
    await renameVersion(orgA, version.id, 'The budget option', 'No spa, smaller deck')
    const list = await listVersions(orgA, projectA)
    expect(list[0]?.name).toBe('The budget option')
    expect(list[0]?.note).toBe('No spa, smaller deck')
  })

  it('deletes a design that is not open', async () => {
    const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Spare' })
    await deleteVersion(orgA, version.id)
    expect(await listVersions(orgA, projectA)).toHaveLength(0)
  })

  // Otherwise the editor is left holding a drawing that no card on the rack
  // describes, which is a state the user cannot see or get out of.
  it('refuses to delete the design that is currently open', async () => {
    const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Open one' })
    await activateVersion(orgA, projectA, version.id)
    await expect(deleteVersion(orgA, version.id)).rejects.toThrow(/currently open/i)
  })

  it('stops at the ceiling rather than letting a job grow without limit', async () => {
    for (let i = 0; i < MAX_VERSIONS_PER_PROJECT; i += 1) {
      await saveVersion({ orgId: orgA, projectId: projectA, name: `Design ${i}` })
    }
    await expect(
      saveVersion({ orgId: orgA, projectId: projectA, name: 'One too many' }),
    ).rejects.toThrow(/Delete one/i)
  })

  describe('organisation scoping', () => {
    it('never lists another organisation\'s designs', async () => {
      await saveVersion({ orgId: orgA, projectId: projectA, name: 'Theirs' })
      expect(await listVersions(orgB, projectA)).toEqual([])
    })

    it('refuses to save onto another organisation\'s job', async () => {
      await expect(
        saveVersion({ orgId: orgB, projectId: projectA, name: 'Sneaky' }),
      ).rejects.toThrow()
    })

    it('refuses to open another organisation\'s design', async () => {
      const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Theirs' })
      await expect(activateVersion(orgB, projectB, version.id)).rejects.toThrow()
    })

    it('refuses to delete another organisation\'s design', async () => {
      const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Theirs' })
      await expect(deleteVersion(orgB, version.id)).rejects.toThrow()
    })

    it('refuses to rename another organisation\'s design', async () => {
      const version = await saveVersion({ orgId: orgA, projectId: projectA, name: 'Theirs' })
      await expect(renameVersion(orgB, version.id, 'Mine now')).rejects.toThrow()
    })
  })
})
