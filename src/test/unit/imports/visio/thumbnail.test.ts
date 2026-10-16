import { describe, expect, it } from 'vitest'
import { thumbnailSvg } from '@/modules/imports/visio/thumbnail'

describe('thumbnailSvg', () => {
  const ring = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1.5 }, { x: 0, y: 1.5 }]

  it('is a standalone svg with the rings as one path', () => {
    const svg = thumbnailSvg([ring], '#00ffff', '#000000')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('viewBox="0 0 3 1.5"')
    expect(svg).toContain('fill="#00ffff"')
    expect(svg).toContain('stroke="#000000"')
    expect(svg).toContain('vector-effect="non-scaling-stroke"')
    expect(svg).toMatch(/d="M0 0 ?L3 0 ?L3 1\.5 ?L0 1\.5 ?Z"/)
  })

  it('refuses colours that are not six-digit hex', () => {
    const svg = thumbnailSvg([ring], 'url(javascript:alert(1))', '"onload="x')
    expect(svg).not.toContain('javascript')
    expect(svg).not.toContain('onload')
  })

  it('pads a hairline so a one-dimensional ring still has a viewBox with area', () => {
    const svg = thumbnailSvg([[{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }]], '#000000', '#000000')
    expect(svg).not.toContain('viewBox="0 0 2 0"')
  })
})
