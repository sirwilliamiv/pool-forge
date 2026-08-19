'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ImageOff, Maximize2, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientToRasterPoint, type CalibrationPoint } from './overlay-geometry'

// Zoom and pan applied once, to a wrapper that holds both the raster and the
// overlay. Registration is therefore structural: there is no second transform
// that could drift out of step with the first.

const MIN_ZOOM = 0.05
const MAX_ZOOM = 12

export interface ImageViewportProps {
  imageUrl: string
  widthPx: number
  heightPx: number
  /** Rendered inside the transformed frame, in source-pixel coordinates. */
  children: (zoom: number) => ReactNode
  /** When set, clicks drop calibration points instead of panning. */
  picking: boolean
  onPick: (point: CalibrationPoint) => void
  /** Human-readable, never a cuid. */
  imageLabel: string
}

export function ImageViewport({
  imageUrl,
  widthPx,
  heightPx,
  children,
  picking,
  onPick,
  imageLabel,
}: ImageViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [loadFailed, setLoadFailed] = useState(false)
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const fit = useCallback(() => {
    const container = containerRef.current
    if (!container || widthPx <= 0 || heightPx <= 0) return
    const { width, height } = container.getBoundingClientRect()
    if (width <= 0 || height <= 0) return
    const padding = 32
    const next = Math.min(
      (width - padding) / widthPx,
      (height - padding) / heightPx,
    )
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next))
    setZoom(clamped)
    setPan({
      x: (width - widthPx * clamped) / 2,
      y: (height - heightPx * clamped) / 2,
    })
  }, [widthPx, heightPx])

  useLayoutEffect(() => {
    fit()
  }, [fit])

  useEffect(() => {
    setLoadFailed(false)
  }, [imageUrl])

  function zoomAbout(clientX: number, clientY: number, factor: number) {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    setZoom((current) => {
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current * factor))
      const scale = next / current
      setPan((currentPan) => {
        const originX = clientX - rect.left
        const originY = clientY - rect.top
        return {
          x: originX - (originX - currentPan.x) * scale,
          y: originY - (originY - currentPan.y) * scale,
        }
      })
      return next
    })
  }

  function zoomAtCentre(factor: number) {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    zoomAbout(rect.left + rect.width / 2, rect.top + rect.height / 2, factor)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (picking) return
    if (event.button !== 0) return
    dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    setPan({
      x: drag.panX + (event.clientX - drag.x),
      y: drag.panY + (event.clientY - drag.y),
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handleFrameClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!picking) return
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const point = clientToRasterPoint({
      clientX: event.clientX,
      clientY: event.clientY,
      rect,
      naturalWidthPx: widthPx,
      naturalHeightPx: heightPx,
    })
    if (point) onPick(point)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          zoomAbout(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 1 / 1.12)
        }}
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden bg-canvas',
          picking ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing',
        )}
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.07) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <div
            ref={frameRef}
            onClick={handleFrameClick}
            className="relative bg-white shadow-pfLg"
            style={{ width: widthPx, height: heightPx }}
          >
            {loadFailed ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 border border-dashed border-border bg-white text-center">
                <ImageOff className="h-8 w-8 text-textFaint" aria-hidden />
                <p className="max-w-[70%] text-sm text-textMuted">
                  {imageLabel} could not be loaded.
                </p>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={imageUrl}
                alt={imageLabel}
                width={widthPx}
                height={heightPx}
                draggable={false}
                onError={() => setLoadFailed(true)}
                className="block h-full w-full select-none object-contain"
              />
            )}
            {children(zoom)}
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-pfMd border border-border bg-white p-0.5 shadow-pfSm">
          <ViewportButton label="Zoom out" onClick={() => zoomAtCentre(1 / 1.25)}>
            <Minus className="h-3.5 w-3.5" />
          </ViewportButton>
          <span className="w-12 text-center text-[11px] tabular-nums text-textMuted">
            {Math.round(zoom * 100)}%
          </span>
          <ViewportButton label="Zoom in" onClick={() => zoomAtCentre(1.25)}>
            <Plus className="h-3.5 w-3.5" />
          </ViewportButton>
          <ViewportButton label="Fit to window" onClick={fit}>
            <Maximize2 className="h-3.5 w-3.5" />
          </ViewportButton>
        </div>
        <span className="pointer-events-none rounded-pfSm bg-white/80 px-2 py-1 text-[10px] text-textFaint">
          Drag to pan, hold ctrl and scroll to zoom
        </span>
      </div>
    </div>
  )
}

function ViewportButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="rounded-pfXs p-1.5 text-textMuted transition-colors hover:bg-rowHover hover:text-foreground focus:outline-none focus:ring-2 focus:ring-pfAccent"
    >
      {children}
    </button>
  )
}
