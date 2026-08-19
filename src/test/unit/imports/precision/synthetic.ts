// Synthetic graph-paper generator.
//
// Grid detection needs ground truth, and ground truth from photographs means
// hand-labelling images nobody has yet. Drawing the grid instead gives an exact
// known pitch, origin, and rotation for free, and lets each hostile condition
// (noise, rotation, uneven lighting, a heavy drawing on top, partial coverage)
// be switched on one at a time so a failure names its own cause.
//
// Not a test file: `vitest.config.ts` only collects `*.test.ts`.

export interface Stroke {
  points: readonly { x: number; y: number }[]
  widthPx: number
  depth: number
  closed: boolean
}

export interface SyntheticGridOptions {
  width: number
  height: number
  pitchPx: number
  /** Offset of the first line from x = 0 and y = 0, before rotation. */
  originX: number
  originY: number
  rotationDeg: number
  /** How much darker a grid line is than the paper, 0..255. */
  gridDepth: number
  lineHalfWidthPx: number
  paper: number
  /** Peak darkening from the lighting ramp across the frame. */
  gradientAmp: number
  noiseAmp: number
  seed: number
  /** Fractional region the grid actually covers, for partial-coverage cases. */
  coverage: { x0: number; y0: number; x1: number; y1: number }
  strokes: readonly Stroke[]
}

export const SYNTHETIC_DEFAULTS: SyntheticGridOptions = {
  width: 480,
  height: 360,
  pitchPx: 20,
  originX: 7,
  originY: 11,
  rotationDeg: 0,
  gridDepth: 45,
  lineHalfWidthPx: 1.1,
  paper: 246,
  gradientAmp: 0,
  noiseAmp: 0,
  seed: 1,
  coverage: { x0: 0, y0: 0, x1: 1, y1: 1 },
  strokes: [],
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function lineProfile(coordinate: number, origin: number, pitch: number, halfWidth: number): number {
  const offset = coordinate - origin
  const nearest = Math.round(offset / pitch) * pitch
  const distance = Math.abs(offset - nearest)
  if (distance >= halfWidth) return 0
  return 1 - distance / halfWidth
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export interface SyntheticImage {
  data: Uint8ClampedArray
  width: number
  height: number
  /** The pitch that detection is supposed to recover. */
  pitchPx: number
}

export function makeGridImage(overrides: Partial<SyntheticGridOptions> = {}): SyntheticImage {
  const o: SyntheticGridOptions = { ...SYNTHETIC_DEFAULTS, ...overrides }
  const data = new Uint8ClampedArray(o.width * o.height)
  const random = mulberry32(o.seed)
  const theta = (o.rotationDeg * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)

  const gx0 = o.coverage.x0 * o.width
  const gx1 = o.coverage.x1 * o.width
  const gy0 = o.coverage.y0 * o.height
  const gy1 = o.coverage.y1 * o.height

  for (let y = 0; y < o.height; y++) {
    for (let x = 0; x < o.width; x++) {
      let value = o.paper
      value -= o.gradientAmp * ((x / o.width) * 0.6 + (y / o.height) * 0.4)

      if (x >= gx0 && x < gx1 && y >= gy0 && y < gy1) {
        const u = x * cos + y * sin
        const v = -x * sin + y * cos
        const ink = Math.max(
          lineProfile(u, o.originX, o.pitchPx, o.lineHalfWidthPx),
          lineProfile(v, o.originY, o.pitchPx, o.lineHalfWidthPx),
        )
        value -= o.gridDepth * ink
      }

      for (const stroke of o.strokes) {
        const points = stroke.points
        const segments = stroke.closed ? points.length : points.length - 1
        let nearest = Infinity
        for (let i = 0; i < segments; i++) {
          const a = points[i]!
          const b = points[(i + 1) % points.length]!
          const d = distanceToSegment(x, y, a.x, a.y, b.x, b.y)
          if (d < nearest) nearest = d
        }
        const halfWidth = stroke.widthPx / 2
        if (nearest < halfWidth) value -= stroke.depth * (1 - nearest / halfWidth)
      }

      if (o.noiseAmp > 0) value += (random() - 0.5) * 2 * o.noiseAmp

      data[y * o.width + x] = Math.max(0, Math.min(255, Math.round(value)))
    }
  }

  return { data, width: o.width, height: o.height, pitchPx: o.pitchPx }
}

/** A pool-shaped closed outline, drawn far darker than the rules underneath it. */
export function poolStroke(width: number, height: number, depth = 190): Stroke {
  const x0 = width * 0.2
  const x1 = width * 0.78
  const y0 = height * 0.24
  const y1 = height * 0.72
  return {
    points: [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    widthPx: 5,
    depth,
    closed: true,
  }
}
