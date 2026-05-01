'use client'

import { useSelectionStore, useShapesStore } from '@/modules/editor/state'
import { ShapeKind, type Shape } from '@/modules/editor/state/shapes'

interface Spec {
  label: string
  value: string
}

interface SpecGroup {
  title: string
  rows: Spec[]
}

function specsFor(shape: Shape): SpecGroup[] {
  if (shape.kind === ShapeKind.RECTANGLE_POOL) {
    return [
      {
        title: 'Structure',
        rows: [
          { label: 'Wall thickness', value: '8 in' },
          { label: 'Rebar', value: '#4 @ 18" OC' },
          { label: 'Concrete strength', value: '4000 PSI' },
          { label: 'Skimmer count', value: '1' },
          { label: 'Main drains', value: '2' },
        ],
      },
      {
        title: 'Plumbing',
        rows: [
          { label: 'Suction', value: '2"' },
          { label: 'Return', value: '1.5"' },
          { label: 'Gas line', value: '3/4"' },
        ],
      },
      {
        title: 'Electrical',
        rows: [
          { label: 'Pump', value: '240V' },
          { label: 'Lights', value: '12V LED' },
          { label: 'Bonding', value: '#8 AWG' },
        ],
      },
    ]
  }

  if (shape.kind === ShapeKind.SPA) {
    return [
      {
        title: 'Structure',
        rows: [
          { label: 'Wall thickness', value: '6 in' },
          { label: 'Rebar', value: '#4 @ 12" OC' },
          { label: 'Jets', value: '6' },
        ],
      },
      {
        title: 'Plumbing',
        rows: [
          { label: 'Spillover', value: '1.5"' },
          { label: 'Heater bypass', value: '1"' },
        ],
      },
      {
        title: 'Electrical',
        rows: [{ label: 'Blower', value: '120V' }],
      },
    ]
  }

  if (
    shape.kind === ShapeKind.CONCRETE_DECK ||
    shape.kind === ShapeKind.PAVER_DECK
  ) {
    return [
      {
        title: 'Structure',
        rows: [
          { label: 'Thickness', value: '4 in' },
          { label: 'Reinforcement', value: '#3 mesh' },
          { label: 'Sub-base', value: '4" compacted' },
        ],
      },
      {
        title: 'Drainage',
        rows: [{ label: 'Slope', value: '1/4" per ft' }],
      },
    ]
  }

  return [
    {
      title: 'Structure',
      rows: [
        { label: 'Type', value: shape.kind.replace('_', ' ').toLowerCase() },
      ],
    },
  ]
}

export function SpecsTab() {
  const selectedId = useSelectionStore((s) => s.selectedIds[0])
  const shape = useShapesStore((s) => s.shapes.find((x) => x.id === selectedId))

  if (!shape) {
    return (
      <p className="px-3 py-4 text-[11.5px] text-textFaint">
        Select something to inspect.
      </p>
    )
  }

  const groups = specsFor(shape)

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.title} className="border-b border-borderLight">
          <header className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.5px] text-textMuted">
            {group.title}
          </header>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-3 pb-3 text-[11.5px]">
            {group.rows.map((row) => (
              <div key={row.label} className="contents">
                <dt className="text-textMuted">{row.label}</dt>
                <dd className="text-right tabular-nums text-foreground">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
