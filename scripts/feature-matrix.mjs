#!/usr/bin/env node
// Render the competitor feature list from the one place the facts live.
//
// Written rather than hand-maintained so the document and the public pages
// cannot drift: both read `src/modules/marketing/competitors.ts`, and a fact
// corrected there is corrected everywhere.
//
//   node scripts/feature-matrix.mjs > docs/feature-matrix.md

import { execFileSync } from 'node:child_process'

const json = execFileSync('npx', ['tsx', '-e', `
  import { ALL_PRODUCTS, FEATURES, capabilityOf, uncontestedFeatures } from './src/modules/marketing/competitors'
  process.stdout.write(JSON.stringify({
    products: ALL_PRODUCTS, features: FEATURES,
    grid: ALL_PRODUCTS.map(p => FEATURES.map(f => capabilityOf(p, f.key))),
    uncontested: uncontestedFeatures(),
  }))
`], { maxBuffer: 32 * 1024 * 1024 }).toString()

const { products, features, grid, uncontested } = JSON.parse(json)
const mark = (s) => ({ yes: 'yes', partial: 'part', no: 'no', unknown: '?' })[s] ?? '?'
const out = []

out.push('# Feature matrix: Pool Forge and the products it is measured against')
out.push('')
out.push('Generated from `src/modules/marketing/competitors.ts`. Do not edit by hand:')
out.push('that file is the one place these facts live, and the public comparison pages')
out.push('read it too, so a correction there fixes both.')
out.push('')
out.push('`?` means nobody checked. It is deliberately not the same as `no`, because a')
out.push('cross next to a named company that nobody verified is a false statement about')
out.push('somebody else\'s product.')
out.push('')

for (const group of ['Design', 'Money', 'Documents', 'Operations']) {
  out.push(`## ${group}`)
  out.push('')
  out.push(`| Feature | ${products.map(p => p.name).join(' | ')} |`)
  out.push(`|---|${products.map(() => '---').join('|')}|`)
  for (const [fi, f] of features.entries()) {
    if (f.group !== group) continue
    const row = products.map((_, pi) => mark(grid[pi][fi].support))
    out.push(`| **${f.label}** | ${row.join(' | ')} |`)
  }
  out.push('')
  for (const f of features.filter(f => f.group === group)) {
    out.push(`- **${f.label}** ${f.matters}`)
  }
  out.push('')
}

out.push('## Where Pool Forge is alone')
out.push('')
if (uncontested.length === 0) {
  out.push('Nothing, on this list. Worth knowing.')
} else {
  for (const f of uncontested) out.push(`- **${f.label}** ${f.matters}`)
}
out.push('')

out.push('## The products, one paragraph each')
out.push('')
for (const p of products) {
  out.push(`### ${p.name}${p.vendor ? ` (${p.vendor})` : ''}`)
  out.push('')
  out.push(p.summary)
  out.push('')
  out.push(`- Price: ${p.pricing ?? 'not published'}`)
  out.push(`- Source: ${p.site} · checked ${p.verified}`)
  out.push(`- Strong at: ${p.strengths.join(' ')}`)
  out.push(`- Gaps for a pool builder: ${p.gaps.join(' ')}`)
  out.push('')
}

process.stdout.write(out.join('\n'))
