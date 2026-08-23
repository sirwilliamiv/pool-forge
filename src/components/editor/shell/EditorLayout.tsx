'use client'

import { useEffect, useRef } from 'react'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { EditorPersistence } from '@/components/editor/EditorPersistence'
import { ExportCommandHandlers } from '@/components/exports/ExportCommandHandlers'
import { R3FCanvas } from '@/lib/three/r3f-canvas'
import type { Shape } from '@/modules/editor/state/shapes'
import type { SiteGrade } from '@/modules/editor/grade/model'
import type { SurveyConfig } from '@/modules/editor/state/surveyStore'
import type { ValidationReport } from '@/modules/validation/types'
import { CanvasOverlay } from './CanvasOverlay'
import { CommandPalette } from './CommandPalette'
import { ContextualToolbar } from './ContextualToolbar'
import { HeaderBar } from './HeaderBar'
import { LeftPanel } from './LeftPanel'
import { ModePillContainer } from './ModePillContainer'
import { QuoteDock } from './QuoteDock'
import { RightPanel } from './RightPanel'
import { SelectionLabelOverlay } from './SelectionLabelOverlay'
import { SunDial } from './SunDial'
import { Toolbar } from './Toolbar'
import { ValidationDock } from './ValidationDock'
import { ViewCube } from './ViewCube'
import { SelectionCard } from './inspector/SelectionCard'
import { PositionSection } from './inspector/PositionSection'
import { GeometrySection } from './inspector/GeometrySection'
import { MaterialSection } from './inspector/MaterialSection'
import { ComputedMetrics } from './inspector/ComputedMetrics'
import { QuoteContribution } from './inspector/QuoteContribution'
import type { Suggestion } from '@/lib/commands/suggestions'
import { EMPTY_FINISH_CATALOG, type FinishCatalog } from '@/modules/materials/catalog'
import { useMaterialsStore } from '@/modules/editor/state/materialsStore'
import { PricingProvider, type PricingInput } from './LiveQuote'

export interface EditorLayoutProps {
  projectId: string
  projectName: string
  customerName?: string | null | undefined
  orgName?: string | null | undefined
  user: {
    name?: string | null | undefined
    email?: string | null | undefined
    image?: string | null | undefined
  }
  initial: {
    shapes: Shape[]
    survey?: SurveyConfig | null
    /** Absent on any drawing made before grading existed: that means flat. */
    grade?: { existing: SiteGrade; finished: SiteGrade } | null
  }
  validationReport: ValidationReport | null
  /**
   * Price book + selections for this project, or null when the organisation has
   * no active price book. The quote itself is computed in the browser from the
   * live shape store so the dock cannot lag the drawing.
   */
  pricing: PricingInput | null
  paletteSuggestions: Suggestion[]
  /**
   * The organisation's finish catalogue, already joined to its price book on
   * the server. One list, so the inspector, the materials panel and the live
   * quote cannot show three different prices for one finish.
   */
  finishCatalog?: FinishCatalog
}

export function EditorLayout({
  projectId,
  projectName,
  customerName,
  orgName,
  user,
  initial,
  validationReport,
  pricing,
  paletteSuggestions,
  finishCatalog = EMPTY_FINISH_CATALOG,
}: EditorLayoutProps) {
  // Seeded on the first render rather than in an effect, because the finish
  // rows and the live quote both read the catalogue on their first paint and an
  // effect would let them paint once against an empty one — which looks exactly
  // like the bug this replaces, a finish snapping back to the top of the list.
  // Safe to write during render only here: no subscriber has mounted yet on the
  // first pass. Every later change goes through the effect below.
  const seeded = useRef(false)
  if (!seeded.current) {
    seeded.current = true
    useMaterialsStore.setState({ catalog: finishCatalog })
  }
  useEffect(() => {
    useMaterialsStore.getState().hydrate(finishCatalog)
  }, [finishCatalog])

  return (
    <PricingProvider value={pricing}>
      <div
        className="fixed inset-0 z-40 grid min-w-[1024px] bg-canvas text-foreground"
        style={{ gridTemplateRows: '44px 1fr', gridTemplateColumns: '248px 1fr 296px' }}
      >
      <div className="col-span-3">
        <HeaderBar
          projectId={projectId}
          projectName={projectName}
          customerName={customerName}
          orgName={orgName}
          user={user}
        />
      </div>

      <LeftPanel />

      <main className="relative overflow-hidden">
        <R3FCanvas />
        <CanvasOverlay
          modePillSlot={<ModePillContainer />}
          quoteDockSlot={<QuoteDock />}
          viewCubeSlot={<ViewCube />}
          sunDialSlot={<SunDial />}
          toolbarSlot={<Toolbar />}
          validationDockSlot={<ValidationDock validationResult={validationReport} />}
          selectionLabelSlot={<SelectionLabelOverlay />}
          contextualToolbarSlot={<ContextualToolbar />}
        />
      </main>

      <RightPanel
        selectionCardSlot={<SelectionCard />}
        positionSlot={<PositionSection />}
        geometrySlot={<GeometrySection />}
        materialSlot={<MaterialSection />}
        computedMetricsSlot={<ComputedMetrics />}
        quoteContributionSlot={<QuoteContribution />}
      />

      <EditorPersistence projectId={projectId} initial={initial} />
      <ClientCommandHandlers />
      <ExportCommandHandlers />
      <CommandPalette suggestions={paletteSuggestions} projectId={projectId} />
      </div>
    </PricingProvider>
  )
}
