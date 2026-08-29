// Botanical accents.
//
// A pool company's marketing full of palm trees is a cliché with a long and
// embarrassing history: brown trunks, sunset gradients, a little sprig tucked
// into a corner. None of that is here, and the reason it is not is structural
// rather than a matter of taste.
//
// The bible's abstract accents are already "hard-edged flat shapes on white:
// squares with a quarter-circle bitten out of one corner, squircles with
// opposing petals, checkerboards". Both plants below are that same grammar
// pushed one step further, until it happens to name something:
//
//   - A monstera leaf is a squircle with bites taken out of it. The
//     fenestrations are the identical subtract operation the bible already
//     describes; only the count and placement change.
//
//   - A palm frond is a radial array with the spokes tapered and swept, which
//     is the ray fan's construction along a curve instead of around a point.
//     It is generated here from a spine and a taper, not traced.
//
// So they are not illustration imported into the system. They are the system,
// continued. That is the whole argument for their being allowed in, and if a
// future shape cannot be derived the same way it does not belong beside them.
//
// The rules that keep them out of the ditch are in `docs/brand-bible.md` under
// "Botanical accents". The short version: one flat colour, no outline, no
// gradient, no shadow, no trunk, no veins. Cropped hard and enormous, never
// centred, never whole, never small and sprinkled. One accent language per
// composition — botanical or geometric, never both in the same frame.

/**
 * Monstera, as a silhouette with the fenestrations punched through.
 *
 * Masked rather than drawn with background-coloured holes on top, so the holes
 * are genuinely transparent and the leaf can sit over a tint field or over
 * another shape without carrying a white ghost with it.
 *
 * `id` has to be unique on the page: SVG mask references are global, and two
 * leaves sharing one id means the second silently reuses the first's mask.
 */
export function MonsteraLeaf({
  id,
  className,
  style,
}: {
  id: string
  className?: string
  style?: React.CSSProperties
}) {
  const maskId = `pf-monstera-${id}`

  // Fenestrations: wedges struck outward and down from the midrib, widening as
  // they go and stopping short of the edge. Tapered rather than parallel-sided,
  // because a slit of constant width reads as stitching rather than as a split
  // in a leaf — the first version of this looked like a fishbone.
  //
  // deg is below horizontal; the splits fan steeper toward the base, which is
  // the direction the blade itself is running by then.
  const holes = [
    { y: 54, deg: 13, len: 52, inner: 2.5, outer: 7 },
    { y: 92, deg: 24, len: 70, inner: 3, outer: 9.5 },
    { y: 128, deg: 36, len: 66, inner: 3, outer: 9.5 },
    { y: 160, deg: 50, len: 46, inner: 2.5, outer: 7.5 },
  ]

  /** One wedge, as a flat quad. Hard edges, in keeping with the rest. */
  const wedge = (y: number, deg: number, len: number, inner: number, outer: number, side: 1 | -1) => {
    const rad = (deg * Math.PI) / 180
    const dx = Math.cos(rad) * side
    const dy = Math.sin(rad)
    const bx = 100 + 9 * side
    const ex = bx + dx * len
    const ey = y + dy * len
    // Perpendicular to the wedge's own direction, so the taper stays square to it.
    const px = -dy * side
    const py = Math.cos(rad)
    return (
      `M${(bx + px * inner).toFixed(1)} ${(y + py * inner).toFixed(1)} ` +
      `L${(ex + px * outer).toFixed(1)} ${(ey + py * outer).toFixed(1)} ` +
      `L${(ex - px * outer).toFixed(1)} ${(ey - py * outer).toFixed(1)} ` +
      `L${(bx - px * inner).toFixed(1)} ${(y - py * inner).toFixed(1)} Z`
    )
  }

  return (
    <svg
      viewBox="0 0 200 220"
      className={className}
      style={style}
      aria-hidden
      focusable="false"
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="220">
        {/* The blade. One closed shape, notched at the base the way the leaf is. */}
        <path
          d="M100 8 C140 30 178 68 194 116 C200 150 176 196 146 208 C132 212 118 200 104 178
             L100 172 L96 178 C82 200 68 212 54 208 C24 196 0 150 6 116 C22 68 60 30 100 8 Z"
          fill="#fff"
        />
        <g fill="#000">
          {holes.map((hole) => (
            <g key={hole.y}>
              <path d={wedge(hole.y, hole.deg, hole.len, hole.inner, hole.outer, 1)} />
              <path d={wedge(hole.y, hole.deg, hole.len, hole.inner, hole.outer, -1)} />
            </g>
          ))}
        </g>
      </mask>
      <rect width="200" height="220" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  )
}

/* ------------------------------------------------------------------ palm */

type Point = readonly [number, number]

/** A point on the quadratic spine, and the direction it is heading. */
function spineAt(t: number, p0: Point, p1: Point, p2: Point): { at: Point; dir: Point } {
  const u = 1 - t
  const at: Point = [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ]
  const dx = 2 * u * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
  const dy = 2 * u * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
  const len = Math.hypot(dx, dy) || 1
  return { at, dir: [dx / len, dy / len] }
}

/**
 * A palm frond, generated rather than traced.
 *
 * Leaflets are struck perpendicular to a curved spine, swept back toward the
 * stem, and tapered from the middle of the frond outward in both directions —
 * which is how a real one grows and, more to the point, is the ray fan's
 * construction run along a curve instead of around a point.
 *
 * No trunk. A palm tree is where this gets tacky; a frond entering the frame
 * from an edge is a shape.
 */
export function PalmFrond({
  className,
  style,
  leaflets = 13,
}: {
  className?: string
  style?: React.CSSProperties
  /** Fewer and broader reads as palm; many and thin reads as fern. */
  leaflets?: number
}) {
  // Only gently curved. A strongly bent spine crowds the concave side until the
  // leaflets there merge into one serrated mass, which is what a frond must not
  // look like: the gaps between leaflets are the thing that makes it a frond.
  const p0: Point = [18, 206]
  const p1: Point = [92, 82]
  const p2: Point = [198, 34]

  const blades: string[] = []

  for (let i = 0; i < leaflets; i += 1) {
    const t = (i + 0.6) / leaflets
    const { at, dir } = spineAt(t, p0, p1, p2)

    // Longest around a third of the way along, tapering to nothing at the tip
    // and shortening again at the stem end.
    const taper = Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.62
    const length = 26 + 86 * taper

    for (const side of [1, -1] as const) {
      const nx = -dir[1] * side
      const ny = dir[0] * side

      // The inner, concave side crowds: at equal length those leaflets converge
      // and fill in as a solid mass. Shortening them keeps the frond open.
      const reach = length * (side === 1 ? 1 : 0.66)

      // Swept back along the spine, so it reads as growing rather than as a comb.
      const sweep = 0.46
      const tipX = at[0] + nx * reach - dir[0] * reach * sweep
      const tipY = at[1] + ny * reach - dir[1] * reach * sweep

      // Belly of the blade. Narrow, and long: a palm leaflet is a strap. Too
      // thin and the whole thing reads as a fern; too wide and neighbouring
      // leaflets touch and it becomes one serrated leaf. The gap between them
      // is what has to survive.
      const belly = 0.13
      const c1x = at[0] + nx * reach * 0.44 + dir[0] * reach * belly
      const c1y = at[1] + ny * reach * 0.44 + dir[1] * reach * belly
      const c2x = at[0] + nx * reach * 0.52 - dir[0] * reach * (belly + 0.2)
      const c2y = at[1] + ny * reach * 0.52 - dir[1] * reach * (belly + 0.2)

      blades.push(
        `M${at[0].toFixed(1)} ${at[1].toFixed(1)} ` +
          `Q${c1x.toFixed(1)} ${c1y.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} ` +
          `Q${c2x.toFixed(1)} ${c2y.toFixed(1)} ${at[0].toFixed(1)} ${at[1].toFixed(1)} Z`,
      )
    }
  }

  return (
    <svg
      viewBox="0 0 220 230"
      className={className}
      style={style}
      aria-hidden
      focusable="false"
    >
      <g fill="currentColor">
        {/* The rachis, drawn as a tapering sliver rather than a stroke so the
            whole frond is one flat fill with no line weight in the system. */}
        <path
          d={`M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}
              Q${p1[0] + 6} ${p1[1] + 7} ${p0[0] + 7} ${p0[1] + 2} Z`}
        />
        {blades.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  )
}
