'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Layers, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dispatch } from '@/lib/commands/dispatch'
import { cn } from '@/lib/utils'
import type { DesignIntent } from '@/modules/imports/intent'
import type { DesignIntentPatch } from '@/modules/imports/patch'
import { ApplyBar } from './ApplyBar'
import { CalibrationPanel } from './CalibrationPanel'
import { ExtractionProgress, SourceImageTabs } from './ExtractionProgress'
import { evaluateApplyGates } from './gates'
import { hasApplicableContent } from './apply-diff'
import { ImageViewport } from './ImageViewport'
import {
  DEFAULT_OVERLAY_TOGGLES,
  IntentOverlay,
  OVERLAY_TOGGLE_LABELS,
  calibrationSpanLabel,
  type OverlayToggleState,
} from './IntentOverlay'
import { IntentPane } from './IntentPane'
import { fieldDomId, groupForPath } from './intent-fields'
import { parseRealDistanceInches, type CalibrationPoint } from './overlay-geometry'
import { sourceImageUrl } from './source-image'
import type { ImportSessionView, ProjectView, SourceImageView } from './types'

// The review wizard.
//
// One rule holds the whole screen together: intent state is only ever replaced
// by what a command returned. Nothing here edits `intent` optimistically,
// because an edit that never reached `import.intent.patch` is an edit the
// audit log never saw and the apply gate never counts.

interface SessionCommandData {
  sessionId: string
  status: ImportSessionView['status']
  intent: DesignIntent
}

interface PatchCommandData extends SessionCommandData {
  touchedPaths: string[]
}

export interface ImportReviewScreenProps {
  project: ProjectView
  session: ImportSessionView
}

export function ImportReviewScreen({ project, session }: ImportReviewScreenProps) {
  const router = useRouter()

  const [intent, setIntent] = useState<DesignIntent>(session.intent)
  const [touched, setTouched] = useState<string[]>(session.touchedFieldPaths)
  const [status, setStatus] = useState<ImportSessionView['status']>(session.status)

  const firstImage = session.images[0]
  const [activeImageId, setActiveImageId] = useState<string>(firstImage ? firstImage.id : '')
  const activeImage: SourceImageView | undefined =
    session.images.find((image) => image.id === activeImageId) ?? firstImage

  const [toggles, setToggles] = useState<OverlayToggleState>(DEFAULT_OVERLAY_TOGGLES)
  const [pendingPaths, setPendingPaths] = useState<ReadonlySet<string>>(new Set())

  const [calibrating, setCalibrating] = useState(false)
  const [calibrationPoints, setCalibrationPoints] = useState<CalibrationPoint[]>([])
  const [distanceText, setDistanceText] = useState('')
  const [savingScale, setSavingScale] = useState(false)
  const [calibrationError, setCalibrationError] = useState<string | null>(null)

  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState(false)

  const readOnly = status === 'APPLIED' || status === 'DISCARDED'

  const gate = useMemo(
    () =>
      evaluateApplyGates({
        intent,
        touched,
        hasContent: hasApplicableContent(intent),
        alreadyApplied: status === 'APPLIED',
      }),
    [intent, touched, status],
  )

  const commitPatch = useCallback(
    (path: string, patch: DesignIntentPatch) => {
      setPendingPaths((current) => new Set(current).add(path))
      void dispatch<{ sessionId: string; patch: DesignIntentPatch }, PatchCommandData>(
        'import.intent.patch',
        { sessionId: session.id, patch },
      ).then((result) => {
        setPendingPaths((current) => {
          const next = new Set(current)
          next.delete(path)
          return next
        })
        if (!result.ok) {
          toast.error(`That correction was not saved. ${result.error}`)
          return
        }
        setIntent(result.data.intent)
        setStatus(result.data.status)
        setTouched((current) => [...new Set([...current, ...result.data.touchedPaths])].sort())
      })
    },
    [session.id],
  )

  function jumpTo(path: string) {
    const node = document.getElementById(fieldDomId(path))
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' })
      node.focus({ preventScroll: true })
      return
    }
    const group = groupForPath(path)
    if (group === null) return
    document
      .getElementById(`intent-group-${group}`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  function pickCalibrationPoint(point: CalibrationPoint) {
    setCalibrationPoints((current) => (current.length >= 2 ? [point] : [...current, point]))
  }

  async function submitScale(pixelsPerInch: number) {
    setSavingScale(true)
    setCalibrationError(null)
    const result = await dispatch<
      { sessionId: string; pixelsPerInch: number; method: 'manual'; confidence: number },
      SessionCommandData
    >('import.calibrate.set', {
      sessionId: session.id,
      pixelsPerInch,
      method: 'manual',
      confidence: 1,
    })
    setSavingScale(false)
    if (!result.ok) {
      setCalibrationError(result.error)
      return
    }
    setIntent(result.data.intent)
    setStatus(result.data.status)
    setCalibrating(false)
    setCalibrationPoints([])
    setDistanceText('')
    toast.success('Scale set from your two points')
  }

  async function analyze(force: boolean) {
    if (!activeImage) return
    setAnalyzing(true)
    setAnalyzeError(null)
    const result = await dispatch<
      { sessionId: string; sourceImageId: string; force: boolean },
      { intent: DesignIntent }
    >('import.image.analyze', {
      sessionId: session.id,
      sourceImageId: activeImage.id,
      force,
    })
    setAnalyzing(false)
    if (!result.ok) {
      setAnalyzeError(result.error)
      return
    }
    setIntent(result.data.intent)
    // Stage rows are written server-side, so the ledger comes from a reload.
    router.refresh()
  }

  async function apply() {
    setApplying(true)
    setApplyError(null)
    const result = await dispatch<
      { sessionId: string; projectId: string },
      { createdShapeIds: string[] }
    >('import.intent.apply', { sessionId: session.id, projectId: project.id })
    setApplying(false)
    if (!result.ok) {
      setApplyError(result.error)
      return
    }
    setStatus('APPLIED')
    toast.success('Imported design applied to the project')
    router.push(`/projects/${project.id}/editor`)
  }

  async function discardSession() {
    setDiscarding(true)
    const result = await dispatch<{ sessionId: string }, { status: string }>(
      'import.session.discard',
      { sessionId: session.id },
    )
    setDiscarding(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Import discarded')
    router.push(`/projects/${project.id}`)
  }

  const calibrationLabel = calibrationSpanLabel(
    calibrationPoints,
    parseRealDistanceInches(distanceText),
  )

  return (
    <div className="flex h-[calc(100vh-3.5rem)] min-w-[1024px] flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-2">
        <Link
          href={`/projects/${project.id}`}
          className="flex items-center gap-1 text-[11.5px] text-textMuted transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          {project.name}
        </Link>
        <span className="text-textFaint" aria-hidden>
          /
        </span>
        <h1 className="text-[12.5px] font-semibold tracking-tight">Review imported design</h1>
        <StatusPill status={status} appliedAtLabel={session.appliedAtLabel} />

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={discardSession}
            disabled={discarding || readOnly}
            className="text-textMuted hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Discard import
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px]">
        <section
          aria-label="Source image and detected geometry"
          className="flex min-h-0 flex-col border-r border-border"
        >
          <SourceImageTabs
            images={session.images}
            activeId={activeImage ? activeImage.id : ''}
            onSelect={setActiveImageId}
          />

          {activeImage ? (
            <ExtractionProgress
              image={activeImage}
              analyzing={analyzing}
              error={analyzeError}
              onAnalyze={(force) => void analyze(force)}
            />
          ) : null}

          <CalibrationPanel
            intent={intent}
            calibrating={calibrating}
            points={calibrationPoints}
            distanceText={distanceText}
            saving={savingScale}
            error={calibrationError}
            disabled={readOnly}
            onStart={() => {
              setCalibrating(true)
              setCalibrationPoints([])
              setDistanceText('')
              setCalibrationError(null)
              setToggles((current) => ({ ...current, calibration: true }))
            }}
            onCancel={() => {
              setCalibrating(false)
              setCalibrationPoints([])
              setCalibrationError(null)
            }}
            onResetPoints={() => setCalibrationPoints([])}
            onDistanceChange={setDistanceText}
            onSubmit={(ppi) => void submitScale(ppi)}
          />

          <OverlayToggleBar toggles={toggles} onChange={setToggles} />

          {activeImage ? (
            <ImageViewport
              imageUrl={sourceImageUrl(activeImage.id)}
              widthPx={activeImage.widthPx}
              heightPx={activeImage.heightPx}
              imageLabel={activeImage.label}
              picking={calibrating}
              onPick={pickCalibrationPoint}
            >
              {(zoom) => (
                <IntentOverlay
                  intent={intent}
                  widthPx={activeImage.widthPx}
                  heightPx={activeImage.heightPx}
                  zoom={zoom}
                  toggles={toggles}
                  calibrationPoints={calibrationPoints}
                  calibrationLabel={calibrationLabel}
                />
              )}
            </ImageViewport>
          ) : (
            <div className="flex flex-1 items-center justify-center bg-canvas text-sm text-textMuted">
              No source image is attached to this import.
            </div>
          )}
        </section>

        <section aria-label="Extracted design" className="flex min-h-0 flex-col">
          <IntentPane
            intent={intent}
            unreviewed={gate.unreviewed}
            pendingPaths={pendingPaths}
            disabled={readOnly}
            onCommit={commitPatch}
            onJump={jumpTo}
          />
        </section>
      </div>

      <ApplyBar
        intent={intent}
        gate={gate}
        applying={applying}
        error={applyError}
        onApply={() => void apply()}
        onCalibrate={() => {
          setCalibrating(true)
          setCalibrationPoints([])
          setDistanceText('')
        }}
      />
    </div>
  )
}

function StatusPill({
  status,
  appliedAtLabel,
}: {
  status: ImportSessionView['status']
  appliedAtLabel: string | null
}) {
  const tone =
    status === 'APPLIED'
      ? 'border-emerald-600/25 bg-emerald-50 text-emerald-800'
      : status === 'DISCARDED'
        ? 'border-border bg-rowHover text-textMuted'
        : 'border-pfAccent/30 bg-pfAccentSoft text-sky-900'

  const label =
    status === 'APPLIED'
      ? appliedAtLabel === null
        ? 'Applied'
        : `Applied ${appliedAtLabel}`
      : status === 'DISCARDED'
        ? 'Discarded'
        : status === 'READY'
          ? 'Ready to review'
          : 'In review'

  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        tone,
      )}
    >
      {label}
    </span>
  )
}

function OverlayToggleBar({
  toggles,
  onChange,
}: {
  toggles: OverlayToggleState
  onChange: (next: OverlayToggleState) => void
}) {
  const keys = Object.keys(OVERLAY_TOGGLE_LABELS) as (keyof OverlayToggleState)[]
  return (
    <div className="flex items-center gap-1.5 border-b border-borderLight bg-white px-4 py-1.5">
      <Layers className="h-3 w-3 shrink-0 text-textFaint" aria-hidden />
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-textMuted">
        Overlays
      </span>
      {keys.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={toggles[key]}
          onClick={() => onChange({ ...toggles, [key]: !toggles[key] })}
          className={cn(
            'rounded-full border px-2 py-0.5 text-[10.5px] transition-colors',
            toggles[key]
              ? 'border-pfAccent/40 bg-pfAccentSoft text-sky-900'
              : 'border-border bg-white text-textFaint hover:bg-rowHover',
          )}
        >
          {OVERLAY_TOGGLE_LABELS[key]}
        </button>
      ))}
    </div>
  )
}
