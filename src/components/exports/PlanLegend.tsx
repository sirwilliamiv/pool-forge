import { planLegend, type LegendKey, type PlanVariant } from '@/modules/exports/plan'
import type { Shape } from '@/modules/editor/state/shapes'

// A legend that describes the drawing it is printed on.
//
// The packet used to list eight symbols and draw none of them, which sends a
// crew looking for information that was never there. Both the rows and the
// swatches come from the same reading of the shapes as the plan, so a symbol
// cannot appear here without appearing on the sheet.

const INK = '#111827'
const LIGHT = '#6B7280'
const HAIRLINE = '#9CA3AF'

function Swatch({ kind }: { kind: LegendKey }) {
  const common = { width: 34, height: 16, viewBox: '0 0 34 16' } as const
  switch (kind) {
    case 'property-line':
      return (
        <svg {...common} aria-hidden>
          <line x1={1} y1={8} x2={33} y2={8} stroke={INK} strokeWidth={3} />
        </svg>
      )
    case 'setback-line':
      return (
        <svg {...common} aria-hidden>
          <line x1={1} y1={8} x2={33} y2={8} stroke={LIGHT} strokeWidth={1.5} strokeDasharray="6 4" />
        </svg>
      )
    case 'structure':
      return (
        <svg {...common} aria-hidden>
          <defs>
            <pattern id="lg-hatch" width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1={0} y1={0} x2={0} y2={4} stroke={HAIRLINE} strokeWidth={1} />
            </pattern>
          </defs>
          <rect x={1} y={1} width={32} height={14} fill="url(#lg-hatch)" stroke={INK} strokeWidth={1.4} />
        </svg>
      )
    case 'pool':
      return (
        <svg {...common} aria-hidden>
          <rect x={1} y={1} width={32} height={14} fill="#E8F1F7" stroke={INK} strokeWidth={2} />
        </svg>
      )
    case 'deck':
      return (
        <svg {...common} aria-hidden>
          <rect x={1} y={1} width={32} height={14} fill="#F3F4F6" stroke={LIGHT} strokeWidth={1.2} />
        </svg>
      )
    case 'equipment-pad':
      return (
        <svg {...common} aria-hidden>
          <defs>
            <pattern id="lg-pad" width={4} height={4} patternUnits="userSpaceOnUse">
              <path d="M 0 4 L 4 0" stroke={HAIRLINE} strokeWidth={1} />
            </pattern>
          </defs>
          <rect x={1} y={1} width={32} height={14} fill="url(#lg-pad)" stroke={INK} strokeWidth={1.2} />
        </svg>
      )
    case 'plumbing':
      return (
        <svg {...common} aria-hidden>
          <line x1={1} y1={8} x2={33} y2={8} stroke={INK} strokeWidth={1.2} strokeDasharray="5 3" />
        </svg>
      )
    case 'centre-line':
      return (
        <svg {...common} aria-hidden>
          <line x1={1} y1={8} x2={33} y2={8} stroke={LIGHT} strokeWidth={1} strokeDasharray="9 3 1.5 3" />
        </svg>
      )
    case 'dimension':
      return (
        <svg {...common} aria-hidden>
          <line x1={4} y1={8} x2={30} y2={8} stroke={INK} strokeWidth={1} />
          <line x1={2} y1={11} x2={6} y2={5} stroke={INK} strokeWidth={1} />
          <line x1={28} y1={11} x2={32} y2={5} stroke={INK} strokeWidth={1} />
        </svg>
      )
    case 'north-arrow':
      return (
        <svg {...common} aria-hidden>
          <circle cx={17} cy={8} r={7} fill="none" stroke={INK} strokeWidth={1} />
          <path d="M 17 2 L 20 12 L 17 9.5 L 14 12 Z" fill={INK} />
        </svg>
      )
    case 'scale-bar':
      return (
        <svg {...common} aria-hidden>
          {[0, 1, 2, 3].map(i => (
            <rect
              key={i}
              x={1 + i * 8}
              y={5}
              width={8}
              height={6}
              fill={i % 2 === 0 ? INK : '#ffffff'}
              stroke={INK}
              strokeWidth={0.8}
            />
          ))}
        </svg>
      )
  }
}

export function PlanLegend({ shapes, variant }: { shapes: Shape[]; variant: PlanVariant }) {
  const entries = planLegend(shapes, variant)
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
      {entries.map(entry => (
        <div key={entry.key} className="flex items-center gap-2">
          <Swatch kind={entry.key} />
          <span>{entry.label}</span>
        </div>
      ))}
    </div>
  )
}
