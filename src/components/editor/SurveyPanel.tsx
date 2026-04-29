'use client'

import { useRef, useState } from 'react'
import { Image as ImageIcon, Lock, Unlock, Ruler, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { useSurveyStore, type SurveyConfig } from '@/modules/editor/state/surveyStore'

const MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_SURVEY_FT_WIDE = 50

// Read an image file as data URL + capture its natural dimensions.
async function readImage(file: File): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
  const { widthPx, heightPx } = await new Promise<{ widthPx: number; heightPx: number }>(
    (resolve, reject) => {
      const img = new globalThis.Image()
      img.onload = () => resolve({ widthPx: img.naturalWidth, heightPx: img.naturalHeight })
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = dataUrl
    },
  )
  return { dataUrl, widthPx, heightPx }
}

export function SurveyPanel() {
  const survey = useSurveyStore((s) => s.survey)
  const setSurvey = useSurveyStore((s) => s.setSurvey)
  const setOpacity = useSurveyStore((s) => s.setOpacity)
  const setLocked = useSurveyStore((s) => s.setLocked)
  const patchSurvey = useSurveyStore((s) => s.patchSurvey)

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [calibrateOpen, setCalibrateOpen] = useState(false)
  const [calibrateInput, setCalibrateInput] = useState('')

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (!/^image\/(png|jpeg|jpg)$/.test(file.type)) {
      toast.error('Only PNG / JPEG supported')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`Too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max 5 MB)`)
      return
    }
    try {
      const { dataUrl, widthPx, heightPx } = await readImage(file)
      const widthInches = DEFAULT_SURVEY_FT_WIDE * 12
      const aspect = heightPx / widthPx
      const next: SurveyConfig = {
        imageDataUrl: dataUrl,
        x: 100,
        y: 100,
        widthInches,
        heightInches: widthInches * aspect,
        opacity: 0.6,
        locked: false,
        calibrationPxDistance: 0,
        calibrationRealInches: 0,
        imageNaturalWidthPx: widthPx,
        imageNaturalHeightPx: heightPx,
      }
      setSurvey(next)
      toast.success('Survey loaded — calibrate scale next')
    } catch (err) {
      toast.error('Failed to read image')
      console.error(err)
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click()
  }

  function applyCalibration() {
    const realFt = Number.parseFloat(calibrateInput)
    if (!survey || !Number.isFinite(realFt) || realFt <= 0) {
      toast.error('Enter a positive width in feet')
      return
    }
    const newWidthInches = realFt * 12
    const aspect = survey.heightInches / survey.widthInches
    patchSurvey({
      widthInches: newWidthInches,
      heightInches: newWidthInches * aspect,
      calibrationRealInches: newWidthInches,
      calibrationPxDistance: survey.imageNaturalWidthPx,
    })
    setCalibrateOpen(false)
    setCalibrateInput('')
    toast.success(`Survey resized to ${realFt} ft wide`)
  }

  function removeSurvey() {
    if (!confirm('Remove the survey overlay?')) return
    setSurvey(null)
    toast.success('Survey removed')
  }

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          handleFile(f)
          e.target.value = ''
        }}
      />

      {!survey ? (
        <div className="pointer-events-auto rounded-md border bg-background/95 p-2 shadow-sm">
          <Button size="sm" variant="outline" onClick={openFilePicker}>
            <ImageIcon className="mr-1 h-4 w-4" />
            Upload survey
          </Button>
          <p className="mt-1 text-[10px] text-muted-foreground">
            PNG / JPEG up to 5 MB. PDF coming soon.
          </p>
        </div>
      ) : (
        <div className="pointer-events-auto w-60 space-y-2 rounded-md border bg-background/95 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-medium">Survey overlay</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={removeSurvey}
              title="Remove"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={survey.imageDataUrl}
            alt="Survey thumbnail"
            className="h-16 w-full rounded border bg-muted object-contain"
          />

          <div className="space-y-1">
            <Label className="text-[10px]">
              Opacity {Math.round(survey.opacity * 100)}%
            </Label>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(survey.opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              className="w-full accent-primary"
            />
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant={survey.locked ? 'secondary' : 'outline'}
              onClick={() => setLocked(!survey.locked)}
              title={survey.locked ? 'Unlock' : 'Lock'}
            >
              {survey.locked ? (
                <Lock className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Unlock className="mr-1 h-3.5 w-3.5" />
              )}
              {survey.locked ? 'Locked' : 'Lock'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setCalibrateOpen(true)}>
              <Ruler className="mr-1 h-3.5 w-3.5" />
              Calibrate
            </Button>
          </div>

          <Button size="sm" variant="ghost" className="w-full" onClick={openFilePicker}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Replace
          </Button>

          <div className="text-[10px] text-muted-foreground">
            Width: {(survey.widthInches / 12).toFixed(1)} ft &nbsp;·&nbsp;
            Height: {(survey.heightInches / 12).toFixed(1)} ft
          </div>
        </div>
      )}

      <Dialog open={calibrateOpen} onOpenChange={setCalibrateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calibrate survey scale</DialogTitle>
            <DialogDescription>
              Enter the real-world width of the survey image, in feet. The
              height will scale proportionally.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cal-ft">Survey width (ft)</Label>
            <Input
              id="cal-ft"
              type="number"
              min={1}
              step="0.1"
              value={calibrateInput}
              onChange={(e) => setCalibrateInput(e.target.value)}
              placeholder="e.g. 75"
            />
            <p className="text-xs text-muted-foreground">
              Two-point calibration coming soon — for now, set the overall
              survey width and the canvas will keep aspect ratio.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalibrateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyCalibration}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
