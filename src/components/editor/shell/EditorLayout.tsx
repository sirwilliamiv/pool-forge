'use client'

import { ClientCommandHandlers } from '@/components/editor/ClientCommandHandlers'
import { EditorPersistence } from '@/components/editor/EditorPersistence'
import { R3FCanvas } from '@/lib/three/r3f-canvas'
import type { Shape } from '@/modules/editor/state/shapes'
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
import type { QuoteSummary } from '@/modules/pricing/engine'
import type { RawMaterial } from './materials/MaterialGrid'

interface QuoteDockData {
  id: string
  subtotal: number
  total: number
  delta?: number
  lineItems: Array<{ id: string; name: string; source: string; total: number }>
}

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
  initial: { shapes: Shape[]; survey?: SurveyConfig | null }
  validationReport: ValidationReport | null
  quoteDock: QuoteDockData | null
  inspectorQuote: QuoteSummary | undefined
  paletteSuggestions: Suggestion[]
  materials?: RawMaterial[]
}

export function EditorLayout({
  projectId,
  projectName,
  customerName,
  orgName,
  user,
  initial,
  validationReport,
  quoteDock,
  inspectorQuote,
  paletteSuggestions,
  materials = [],
}: EditorLayoutProps) {
  return (
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

      <LeftPanel materials={materials} />

      <main className="relative overflow-hidden">
        <R3FCanvas />
        <CanvasOverlay
          modePillSlot={<ModePillContainer />}
          quoteDockSlot={<QuoteDock quote={quoteDock} />}
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
        quoteContributionSlot={
          inspectorQuote ? <QuoteContribution quote={inspectorQuote} /> : <QuoteContribution />
        }
      />

      <EditorPersistence projectId={projectId} initial={initial} />
      <ClientCommandHandlers />
      <CommandPalette suggestions={paletteSuggestions} />
    </div>
  )
}
