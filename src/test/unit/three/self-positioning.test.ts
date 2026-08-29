// Source-level guard, in the spirit of the tool-catalogue-versus-toolbar test.
//
// The defect it exists to prevent: an object component that places itself from
// `shape.x` and `shape.y`, rendered inside a wrapper that also places it, lands
// at roughly twice its offset. A tanning ledge asked for on a pool appears
// somewhere else entirely while its selection outline stays correctly on the
// pool, so the object looks missing and the outline looks like it is pointing
// at nothing. Nothing throws, and it is invisible in a diff.
//
// Reading the sources is the only way to check this without a renderer, and it
// is cheap. If a component learns to place itself, this fails by name until the
// dispatch is told.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const OBJECTS_DIR = join(process.cwd(), 'src/components/editor/three/objects')
const SCENE_ROOT = join(process.cwd(), 'src/components/editor/three/SceneRoot.tsx')

/** Components that take a whole `shape` and place themselves from it. */
function selfPlacingComponents(): string[] {
  const found: string[] = []
  for (const file of readdirSync(OBJECTS_DIR)) {
    if (!file.endsWith('.tsx')) continue
    const source = readFileSync(join(OBJECTS_DIR, file), 'utf8')
    // The signature of placing yourself: converting the shape's own coordinates
    // into world units inside a position.
    if (/feet\(\s*shape\.x/.test(source) || /feet\(\s*shape\?\.x/.test(source)) {
      found.push(file.replace(/\.tsx$/, ''))
    }
  }
  return found.sort()
}

describe('object components and where they are placed', () => {
  const sceneRoot = readFileSync(SCENE_ROOT, 'utf8')

  it('finds the components that place themselves', () => {
    // Guards the guard: a regex that matched nothing would make every
    // assertion below vacuously true.
    expect(selfPlacingComponents().length).toBeGreaterThan(0)
  })

  it.each(selfPlacingComponents())(
    '%s places itself, so the scene must not wrap it in a positioned group',
    component => {
      // A wrapped render looks like `<group position={pos}><Component shape=`.
      const wrapped = new RegExp(
        `<group\\s+position=\\{pos\\}>\\s*<${component}\\b`,
        's',
      )
      expect(
        wrapped.test(sceneRoot),
        `${component} reads shape.x itself and SceneRoot also positions it, so it renders at twice its offset`,
      ).toBe(false)
    },
  )

  it('gives every dispatched object component its shape, or it cannot be selected', () => {
    // A component rendered without `shape` never sets `userData.id`, so the
    // picker walks past it and the object cannot be selected, dragged or
    // resized. This is exactly how the house wall became scenery.
    const renders = [...sceneRoot.matchAll(/<([A-Z][A-Za-z]+)\s+([^>]*?)\/>/g)]
    const dispatched = renders.filter(match => /objects\//.test(sceneRoot) && match[1])
    const offenders = dispatched
      .filter(match => {
        const name = match[1] ?? ''
        const props = match[2] ?? ''
        // Only components that accept a shape at all are in scope. Trees and
        // Loungers take their own spec lists and are placed by the caller.
        if (!new RegExp(`function ${name}\\(\\{[^)]*shape`, 's').test(readComponent(name))) {
          return false
        }
        return !/\bshape=\{/.test(props)
      })
      .map(match => match[1])

    expect(offenders).toEqual([])
  })
})

function readComponent(name: string): string {
  try {
    return readFileSync(join(OBJECTS_DIR, `${name}.tsx`), 'utf8')
  } catch {
    return ''
  }
}
