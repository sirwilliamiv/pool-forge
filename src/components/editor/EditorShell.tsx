'use client'

import { CanvasStage } from './CanvasStage'
import { LeftToolbar } from './LeftToolbar'
import { PropertiesPanel } from './PropertiesPanel'
import { QuotePanel } from './QuotePanel'
import { StatusBar } from './StatusBar'
import { StencilPanel } from './StencilPanel'
import { TopToolbar } from './TopToolbar'

export interface EditorShellProps {
  projectId?: string
}

export function EditorShell({ projectId: _projectId }: EditorShellProps = {}) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-background">
      <TopToolbar />
      <div className="flex flex-1 overflow-hidden">
        <LeftToolbar />
        <StencilPanel />
        <main className="relative flex flex-1 overflow-hidden">
          <CanvasStage />
        </main>
        <PropertiesPanel />
      </div>
      <StatusBar />
      <QuotePanel />
    </div>
  )
}
