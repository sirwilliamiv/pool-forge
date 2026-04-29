'use client'

// Outer client component. Konva touches `window`/`document`, so the inner
// stage component is dynamically loaded with ssr:false.
import dynamic from 'next/dynamic'

const InnerCanvas = dynamic(() => import('./CanvasStageInner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted/30 text-sm text-muted-foreground">
      Loading canvas…
    </div>
  ),
})

export function CanvasStage() {
  return <InnerCanvas />
}
