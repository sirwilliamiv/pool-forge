'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  parseSheet,
  rowsToItems,
  type ImportPreview,
  type ImportRow,
  type RowError,
} from '@/modules/pricing/import'
import {
  autoDetectMapping,
  importPriceBookItems,
} from '@/app/(app)/settings/price-book/import/actions'
import { Sparkles } from 'lucide-react'

const FIELDS: { key: keyof ImportRow; label: string; required: boolean }[] = [
  { key: 'category', label: 'Category', required: false },
  { key: 'name', label: 'Name', required: true },
  { key: 'unitType', label: 'Unit type', required: false },
  { key: 'retailPrice', label: 'Retail price', required: true },
  { key: 'unitCost', label: 'Unit cost', required: false },
  { key: 'customerVisible', label: 'Customer visible', required: false },
]

const NONE_VALUE = '__none__'

export function ImportXlsxForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [mapping, setMapping] = useState<Partial<Record<keyof ImportRow, string>>>({})
  const [items, setItems] = useState<ImportRow[]>([])
  const [errors, setErrors] = useState<RowError[]>([])
  // Rows that imported but landed somewhere nobody chose. Kept apart from the
  // errors, because these are not skipped: the builder's price is in the book,
  // it is just filed under Other, and that is a thing they need told rather
  // than a thing to refuse.
  const [warnings, setWarnings] = useState<RowError[]>([])

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer()
      const p = parseSheet(buf)
      setFileName(file.name)
      setPreview(p)
      setMapping(p.detectedMapping)
      const { items, errors, warnings } = rowsToItems(p.rows, p.detectedMapping)
      setItems(items)
      setErrors(errors)
      setWarnings(warnings)
    } catch (err) {
      toast.error(`Failed to parse: ${(err as Error).message}`)
    }
  }

  const [detecting, setDetecting] = useState(false)

  function applyMapping(next: Partial<Record<keyof ImportRow, string>>) {
    if (!preview) return
    setMapping(next)
    const { items, errors, warnings } = rowsToItems(preview.rows, next)
    setItems(items)
    setErrors(errors)
    setWarnings(warnings)
  }

  function updateMapping(field: keyof ImportRow, header: string | undefined) {
    if (!preview) return
    const next = { ...mapping }
    if (header) next[field] = header
    else delete next[field]
    applyMapping(next)
  }

  async function handleAutoDetect() {
    if (!preview) return
    setDetecting(true)
    const res = await autoDetectMapping({ headers: preview.headers, rows: preview.rows })
    setDetecting(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    applyMapping(res.detected)
    if (res.notes.length > 0) {
      toast.message('Columns auto-mapped', { description: res.notes.join(' ') })
    } else {
      toast.success('Columns auto-mapped. Review and import.')
    }
  }

  function handleImport() {
    if (items.length === 0) {
      toast.error('Nothing to import — fix mapping or row errors first')
      return
    }
    if (errors.length > 0 && !confirm(`${errors.length} row(s) have errors and will be skipped. Continue?`)) {
      return
    }
    // Said plainly before it happens: this replaces the list everyone is
    // quoting from, rather than adding to it.
    if (!confirm(`Publish these ${items.length} items as a new version of the price book? Everyone quoting will move to it. The current version is kept.`)) {
      return
    }
    startTransition(async () => {
      try {
        const res = await importPriceBookItems(items)
        // Say which version, because the previous one is still there. An import
        // that turns out to be the wrong file has to look recoverable.
        toast.success(
          `Version ${res.version} published: ${res.created} item${res.created === 1 ? '' : 's'}. ` +
            `Version ${res.version - 1} is kept.`,
        )
        router.push('/settings/price-book')
        router.refresh()
      } catch (err) {
        toast.error(`Import failed: ${(err as Error).message}`)
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="xlsx-file" className="text-formLabel">
          XLSX file
        </Label>
        <input
          id="xlsx-file"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
          className="block w-full text-bodyS text-theme-fg file:mr-4 file:rounded-brand file:border-0 file:bg-theme-fg file:px-4 file:py-2 file:text-bodyS file:font-medium file:text-theme-bg file:transition-[background] file:duration-brand file:ease-brand hover:file:bg-[color-mix(in_oklch,var(--theme-fg),transparent_20%)]"
        />
        {fileName && (
          <p className="text-bodyS text-theme-muted">
            Loaded:{' '}
            <span className="font-brandMono tracking-[0.5px] text-theme-fg">{fileName}</span> ·{' '}
            <span className="font-brandMono tracking-[0.5px]">{preview?.rows.length ?? 0}</span> rows
            · <span className="font-brandMono tracking-[0.5px]">{preview?.headers.length ?? 0}</span>{' '}
            columns
          </p>
        )}
      </div>

      {preview && (
        <>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-bodyS font-medium text-theme-fg">Column mapping</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAutoDetect()}
                disabled={detecting || pending}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                {detecting ? 'Detecting…' : 'Auto-detect columns'}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-formLabel">
                    {f.label}
                    {f.required && <span className="text-brand-red"> *</span>}
                  </Label>
                  <Select
                    value={mapping[f.key] ?? NONE_VALUE}
                    onValueChange={(v) => updateMapping(f.key, v === NONE_VALUE ? undefined : v)}
                  >
                    <SelectTrigger className="border-theme-line bg-theme-field text-theme-fg">
                      <SelectValue placeholder="(unmapped)" />
                    </SelectTrigger>
                    <SelectContent className="border-theme-line bg-theme-bg text-theme-fg">
                      <SelectItem value={NONE_VALUE}>(unmapped)</SelectItem>
                      {preview.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-bodyS font-medium text-theme-fg">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto rounded-brand border border-theme-line">
              <table className="w-full text-bodyS">
                <thead className="border-b border-theme-line bg-theme-card text-left font-brandMono text-formLabel uppercase tracking-[0.6px] text-theme-muted">
                  <tr>
                    {preview.headers.map((h) => (
                      <th key={h} className="px-2 py-1.5 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-theme-line last:border-0">
                      {preview.headers.map((h) => (
                        <td
                          key={h}
                          className="px-2 py-1 font-brandMono text-formLabel tracking-[0.5px] text-theme-fg"
                        >
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-brand border border-theme-line p-3 text-bodyS text-theme-fg">
            <div>
              <span className="font-brandMono tracking-[0.5px] text-theme-fg">{items.length}</span>{' '}
              rows ready ·{' '}
              <span className="font-brandMono tracking-[0.5px] text-brand-orange">
                {errors.length}
              </span>{' '}
              rows with errors
            </div>
            {errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-bodyS text-theme-muted">
                  Show errors
                </summary>
                <ul className="mt-2 space-y-0.5 text-bodyS text-theme-muted">
                  {errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Row {e.rowIndex + 2}: {e.message}
                    </li>
                  ))}
                  {errors.length > 20 && <li>… and {errors.length - 20} more</li>}
                </ul>
              </details>
            )}
            {warnings.length > 0 && (
              <details className="mt-2" open>
                <summary className="cursor-pointer text-bodyS font-medium text-brand-orange">
                  {warnings.length} row{warnings.length === 1 ? '' : 's'} could not be classified and
                  will be filed under Other
                </summary>
                <ul className="mt-2 space-y-0.5 text-bodyS text-theme-muted">
                  {warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>
                      Row {w.rowIndex + 2}: {w.message}
                    </li>
                  ))}
                  {warnings.length > 20 && <li>… and {warnings.length - 20} more</li>}
                </ul>
              </details>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={handleImport} disabled={pending || items.length === 0}>
              {pending ? 'Importing…' : `Import ${items.length} item${items.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
