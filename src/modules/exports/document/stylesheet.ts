// The stylesheet that gets baked into a stored document.
//
// The four documents are styled with Tailwind utilities, so a stored file with
// no stylesheet is a column of unstyled text with a price at the bottom. It has
// to carry its own CSS, and that CSS has to be resolved values rather than
// `hsl(var(--border))`: a stored document that reads design tokens from a
// globals.css it cannot see is a document whose appearance changes when the app
// is restyled, which is the whole thing we are trying to stop.
//
// So Tailwind is run over the markup that is about to be stored, with the stock
// config. Two consequences worth stating:
//
//   - The vocabulary is exactly what the document uses. Nothing else is in the
//     file, so it stays around 12 KB rather than shipping the app's stylesheet.
//   - It is compiled from the *rendered* markup, not from source files, so a
//     class assembled at runtime is covered and no build artifact or source
//     tree has to exist at the moment of the render.
//
// None of the four documents uses a project-specific theme extension (checked:
// every class they emit is stock Tailwind), which is why the stock config is
// enough. If one ever reaches for `bg-background`, this is the file that has to
// learn about `tailwind.config.ts`.

import { createHash } from 'node:crypto'

const DIRECTIVES = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'

/**
 * Compiled stylesheets, keyed by the class vocabulary plus the page rules.
 *
 * A Tailwind build is roughly 50 ms warm, and every export of the same kind
 * uses very nearly the same vocabulary, so this is a near-permanent hit after
 * the first document of each kind. Bounded so a long-lived process cannot grow
 * a cache entry per project.
 */
const CACHE_LIMIT = 32
const cache = new Map<string, string>()

/** Every distinct class name in the markup, sorted, so the cache key is stable. */
export function classVocabulary(markup: string): string[] {
  const seen = new Set<string>()
  for (const match of markup.matchAll(/\sclass="([^"]*)"/g)) {
    const raw = match[1]
    if (!raw) continue
    for (const token of raw.split(/\s+/)) {
      if (token) seen.add(token)
    }
  }
  return [...seen].sort()
}

export function resetStylesheetCache(): void {
  cache.clear()
}

/**
 * The stylesheet for a document, given the markup it will contain and the page
 * rules for its kind.
 */
export async function stylesheetFor(markup: string, pageCss: string): Promise<string> {
  const vocabulary = classVocabulary(markup)
  const key = createHash('sha256')
    .update(vocabulary.join(' '))
    .update(' ')
    .update(pageCss)
    .digest('hex')

  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const [{ default: postcss }, { default: tailwindcss }] = await Promise.all([
    import('postcss'),
    import('tailwindcss'),
  ])

  const result = await postcss([
    tailwindcss({
      // The markup's own vocabulary is the content source. No file globs, so
      // this works identically in dev, in a bundled build, and in a test.
      content: [{ raw: vocabulary.join(' '), extension: 'html' }],
      theme: {},
      plugins: [],
    }),
  ]).process(`${DIRECTIVES}${pageCss}`, { from: undefined })

  const css = result.css
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, css)
  return css
}
