import { describe, expect, it } from 'vitest'
import { DECK_MATERIALS, ENCLOSURE_KINDS, SHAPE_FAMILIES } from '@/modules/imports/intent'
import {
  buildRepairPrompt,
  CLASSIFY_EXTRACTOR_VERSION,
  CLASSIFY_PROMPT,
  CONCEPT_RENDER_EXTRACTOR_VERSION,
  CONCEPT_RENDER_PROMPT,
  hashPrompt,
  IMAGE_KINDS,
  QUALITY_FLAGS,
  SCREENSHOT_EXTRACTOR_VERSION,
  SITE_PHOTO_EXTRACTOR_VERSION,
  SITE_PHOTO_PROMPT,
  SITE_PLAN_EXTRACTOR_VERSION,
  SITE_PLAN_PROMPT,
  SKETCH_EXTRACTOR_VERSION,
  SKETCH_PROMPT,
} from '@/modules/imports/vision'
import { IMAGE_KINDS as KINDS_FROM_TYPES } from '@/modules/imports/vision/types'

const PROMPTS: [string, string][] = [
  ['classify', CLASSIFY_PROMPT],
  ['sketch', SKETCH_PROMPT],
  ['sitePlan', SITE_PLAN_PROMPT],
  ['conceptRender', CONCEPT_RENDER_PROMPT],
  ['sitePhoto', SITE_PHOTO_PROMPT],
]

/** Count the JSON objects shown as examples, not the ones described in prose. */
function exampleCount(prompt: string): number {
  return prompt.split('\n').filter((line) => line.trim().startsWith('{"') || line.trim().startsWith('{ "')).length
}

describe('prompt contract', () => {
  it.each(PROMPTS)('%s shows at least three concrete JSON examples', (_name, prompt) => {
    expect(exampleCount(prompt)).toBeGreaterThanOrEqual(3)
  })

  it.each(PROMPTS)('%s asks for one JSON object and forbids fences', (_name, prompt) => {
    expect(prompt).toContain('one JSON object')
    expect(prompt.toLowerCase()).toContain('markdown')
  })

  it('the classify prompt enumerates every image kind and quality flag', () => {
    for (const kind of IMAGE_KINDS) expect(CLASSIFY_PROMPT).toContain(`"${kind}"`)
    for (const flag of QUALITY_FLAGS) expect(CLASSIFY_PROMPT).toContain(`"${flag}"`)
    expect(KINDS_FROM_TYPES).toEqual(IMAGE_KINDS)
  })

  it.each([
    ['sketch', SKETCH_PROMPT],
    ['conceptRender', CONCEPT_RENDER_PROMPT],
  ])('%s enumerates every shape family', (_name, prompt) => {
    for (const family of SHAPE_FAMILIES) expect(prompt).toContain(`"${family}"`)
  })

  it('the sketch prompt enumerates deck materials and enclosure kinds', () => {
    for (const material of DECK_MATERIALS) expect(SKETCH_PROMPT).toContain(`"${material}"`)
    for (const kind of ENCLOSURE_KINDS) expect(SKETCH_PROMPT).toContain(`"${kind}"`)
  })

  it('the concept render prompt refuses measurements in as many words', () => {
    const lowered = CONCEPT_RENDER_PROMPT.toLowerCase()
    expect(lowered).toContain('never report a dimension')
    for (const word of ['footprint', 'polygon', 'scale', 'depth', 'coordinate']) {
      expect(lowered).toContain(word)
    }
  })

  it('the site photo prompt refuses measurements too', () => {
    expect(SITE_PHOTO_PROMPT.toLowerCase()).toContain('never report a dimension')
  })

  it('no prompt tells the model to use a response schema', () => {
    for (const [, prompt] of PROMPTS) {
      expect(prompt).not.toContain('responseSchema')
    }
  })
})

describe('prompt versions', () => {
  const versions = [
    CLASSIFY_EXTRACTOR_VERSION,
    SKETCH_EXTRACTOR_VERSION,
    SITE_PLAN_EXTRACTOR_VERSION,
    CONCEPT_RENDER_EXTRACTOR_VERSION,
    SITE_PHOTO_EXTRACTOR_VERSION,
    SCREENSHOT_EXTRACTOR_VERSION,
  ]

  it('are unique, so ImageAnalysis rows cannot collide across extractors', () => {
    expect(new Set(versions).size).toBe(versions.length)
  })

  it.each(versions)('%s is a name@semver pair', (version) => {
    expect(version).toMatch(/^[a-zA-Z]+@\d+\.\d+\.\d+$/)
  })
})

describe('repair prompt', () => {
  it('names the problem and every field-level issue', () => {
    const prompt = buildRepairPrompt({
      problem: 'the JSON parsed but did not match the required shape',
      issues: ['pool.shapeFamily: invalid enum value', 'confidence.polygon: must be at most 1'],
    })
    expect(prompt).toContain('the JSON parsed but did not match the required shape')
    expect(prompt).toContain('pool.shapeFamily')
    expect(prompt).toContain('confidence.polygon')
    expect(prompt).toContain('Use null for anything you cannot read')
  })

  it('survives having no field-level detail', () => {
    const prompt = buildRepairPrompt({ problem: 'the response was empty', issues: [] })
    expect(prompt).toContain('no field-level detail available')
  })
})

describe('hashPrompt', () => {
  it('is stable and distinct per prompt, so an analysis row identifies its prompt', () => {
    expect(hashPrompt(SKETCH_PROMPT)).toBe(hashPrompt(SKETCH_PROMPT))
    expect(hashPrompt(SKETCH_PROMPT)).not.toBe(hashPrompt(SITE_PLAN_PROMPT))
    expect(hashPrompt(SKETCH_PROMPT)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('house style', () => {
  it.each(PROMPTS)('%s contains no em dashes', (_name, prompt) => {
    expect(prompt).not.toMatch(/—/)
  })
})
