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
  projectName?: string
}

export function EditorShell({
  projectId,
  projectName,
}: EditorShellProps = {}) {
  const toolbarProps: { projectId?: string; projectName?: string } = {}
  if (projectId !== undefined) toolbarProps.projectId = projectId
  if (projectName !== undefined) toolbarProps.projectName = projectName
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <TopToolbar {...toolbarProps} />
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
