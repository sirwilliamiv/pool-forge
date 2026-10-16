'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { dispatch } from '@/lib/commands/dispatch'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/modules/editor/stencils/categories'
import { ShapeKind, type StencilCategory } from '@/modules/editor/stencils/types'
import {
  LibraryCommand,
  PLACEABLE_SHAPE_KINDS,
  SKIP_REASON_LABEL,
  VISIO_SCALE_OPTIONS,
  VisioMessage,
  type CommitInput,
  type CommitItem,
  type CommitOutput,
  type OrgStencilSummary,
  type PlaceableShapeKind,
  type PreviewOutput,
} from '@/modules/imports/visio/types'
import { dimensionLabel, svgDataUrl } from './LibraryStencilCard'

const KIND_LABEL: Record<PlaceableShapeKind, string> = {
  [ShapeKind.POLYGON_POOL]: 'Freeform pool',
  [ShapeKind.SKETCH_PATH]: 'Outline',
  [ShapeKind.SPA]: 'Spa',
  [ShapeKind.SUN_SHELF]: 'Sun shelf',
  [ShapeKind.BENCH]: 'Bench',
  [ShapeKind.CONCRETE_DECK]: 'Concrete deck',
  [ShapeKind.PAVER_DECK]: 'Paver deck',
  [ShapeKind.GRASS_AREA]: 'Grass',
}

const NAME_REQUIRED = 'Every stencil you import needs a name.'
const TRIGGER_CLASS = 'h-8 border-theme-line bg-theme-field text-[12px] text-theme-fg'
const CONTENT_CLASS = 'border-theme-line bg-theme-bg text-theme-fg'

function plural(n: number): string {
  return `${n} stencil${n === 1 ? '' : 's'}`
}

interface Props {
  preview: PreviewOutput
  onClose: () => void
  onImported: (stencils: OrgStencilSummary[]) => void
}

export function VisioImportDialog({ preview, onClose, onImported }: Props) {
  const [scale, setScale] = useState(preview.scaleInchesPerInch)
  const [rows, setRows] = useState<CommitItem[]>(() =>
    preview.candidates.map((c) => ({
      index: c.index,
      include: true,
      name: c.name,
      category: c.category,
      shapeKind: c.shapeKind,
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // The file's own scale may not be one of the named ones; offer it anyway so
  // the select never shows a blank.
  const scaleOptions = useMemo(() => {
    if (VISIO_SCALE_OPTIONS.some((o) => o.inchesPerInch === preview.scaleInchesPerInch)) return VISIO_SCALE_OPTIONS
    return [
      ...VISIO_SCALE_OPTIONS,
      { inchesPerInch: preview.scaleInchesPerInch, label: `1 in = ${preview.scaleInchesPerInch} in` },
    ]
  }, [preview.scaleInchesPerInch])

  const included = rows.filter((r) => r.include).length

  const patch = (index: number, change: Partial<CommitItem>) => {
    setRows((prev) => prev.map((r) => (r.index === index ? { ...r, ...change } : r)))
    setError(null)
  }

  const submit = async () => {
    if (included === 0) {
      setError(VisioMessage.NOTHING_SELECTED)
      return
    }
    if (rows.some((r) => r.include && r.name.trim().length === 0)) {
      setError(NAME_REQUIRED)
      return
    }
    // Every row goes, ticked or not, so the audit row records what was turned down.
    const items: CommitItem[] = rows.map((r) => {
      const candidate = preview.candidates.find((c) => c.index === r.index)
      const name = r.name.trim() || candidate?.name || r.name
      return { index: r.index, include: r.include, name, category: r.category, shapeKind: r.shapeKind }
    })
    setSubmitting(true)
    setError(null)
    const result = await dispatch<CommitInput, CommitOutput>(LibraryCommand.COMMIT, {
      importId: preview.importId,
      scaleInchesPerInch: scale,
      items,
    })
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const { created, replaced } = result.data
    toast.success(
      replaced > 0
        ? `${plural(created + replaced)} in My library, ${replaced} replaced.`
        : `${plural(created)} added to My library.`,
    )
    onImported(result.data.stencils)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitting) onClose()
      }}
    >
      <DialogContent className="flex max-h-[88vh] w-[calc(100vw-32px)] flex-col gap-3 border-theme-line bg-theme-bg text-theme-fg sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import from {preview.fileName}</DialogTitle>
          <DialogDescription className="text-theme-muted">
            {plural(preview.candidates.length)} found. Untick what you do not want and fix any name, category or kind.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-theme-muted">
          <span>Drawn at</span>
          <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
            <SelectTrigger aria-label="Drawing scale" className={`${TRIGGER_CLASS} w-36`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className={CONTENT_CLASS}>
              {scaleOptions.map((o) => (
                <SelectItem key={o.inchesPerInch} value={String(o.inchesPerInch)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span>Sizes below follow it.</span>
        </div>

        <ul className="-mx-1 min-h-0 flex-1 divide-y divide-theme-line overflow-y-auto px-1">
          {preview.candidates.map((c) => {
            const row = rows.find((r) => r.index === c.index)
            if (!row) return null
            const label = row.name.trim() || c.name
            return (
              <li key={c.index} className="flex flex-wrap items-center gap-2 py-2">
                <Checkbox
                  aria-label={label}
                  checked={row.include}
                  onCheckedChange={(v) => patch(c.index, { include: v === true })}
                />
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-brand4 bg-theme-field p-1">
                  {/* An inline SVG data URL: nothing for next/image to optimise. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="" src={svgDataUrl(c.thumbnailSvg)} className="max-h-full max-w-full" />
                </span>
                <Input
                  value={row.name}
                  maxLength={120}
                  aria-label={`Name for ${label}`}
                  onChange={(e) => patch(c.index, { name: e.target.value })}
                  className="h-8 min-w-[9rem] flex-1 text-[12px]"
                />
                <Select
                  value={row.category}
                  onValueChange={(v) => patch(c.index, { category: v as StencilCategory })}
                >
                  <SelectTrigger aria-label={`Category for ${label}`} className={`${TRIGGER_CLASS} w-40`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={CONTENT_CLASS}>
                    {CATEGORY_ORDER.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {CATEGORY_LABEL[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.shapeKind}
                  onValueChange={(v) => patch(c.index, { shapeKind: v as PlaceableShapeKind })}
                >
                  <SelectTrigger aria-label={`Kind for ${label}`} className={`${TRIGGER_CLASS} w-36`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={CONTENT_CLASS}>
                    {PLACEABLE_SHAPE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {KIND_LABEL[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-theme-muted">
                  {dimensionLabel(c.drawingWidthIn * scale, c.drawingHeightIn * scale)}
                </span>
              </li>
            )
          })}
        </ul>

        {preview.skipped.length > 0 ? (
          <details className="text-[12px] text-theme-muted">
            <summary className="cursor-pointer select-none">Skipped ({preview.skipped.length})</summary>
            <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto pl-4">
              {preview.skipped.map((s) => (
                <li key={s.index} className="flex flex-wrap gap-x-2">
                  <span className="text-theme-fg">{s.name}</span>
                  <span>{SKIP_REASON_LABEL[s.reason]}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        {error !== null ? (
          <p role="alert" className="rounded-brand4 border border-brand-red/25 bg-tint-blush px-3 py-2 text-[12px] text-theme-fg">
            {error}
          </p>
        ) : included === 0 ? (
          <p className="text-[12px] text-theme-muted">{VisioMessage.NOTHING_SELECTED}</p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={included === 0 || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {`Import ${plural(included)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
