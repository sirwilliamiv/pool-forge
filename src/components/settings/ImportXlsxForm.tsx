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
import { importPriceBookItems } from '@/app/(app)/settings/price-book/import/actions'

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

  async function handleFile(file: File) {
    try {
      const buf = await file.arrayBuffer()
      const p = parseSheet(buf)
      setFileName(file.name)
      setPreview(p)
      setMapping(p.detectedMapping)
      const { items, errors } = rowsToItems(p.rows, p.detectedMapping)
      setItems(items)
      setErrors(errors)
    } catch (err) {
      toast.error(`Failed to parse: ${(err as Error).message}`)
    }
  }

  function updateMapping(field: keyof ImportRow, header: string | undefined) {
    if (!preview) return
    const next = { ...mapping }
    if (header) next[field] = header
    else delete next[field]
    setMapping(next)
    const { items, errors } = rowsToItems(preview.rows, next)
    setItems(items)
    setErrors(errors)
  }

  function handleImport() {
    if (items.length === 0) {
      toast.error('Nothing to import — fix mapping or row errors first')
      return
    }
    if (errors.length > 0 && !confirm(`${errors.length} row(s) have errors and will be skipped. Continue?`)) {
      return
    }
    startTransition(async () => {
      try {
        const res = await importPriceBookItems(items)
        toast.success(`Imported ${res.created} item${res.created === 1 ? '' : 's'}`)
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
        <Label htmlFor="xlsx-file">XLSX file</Label>
        <input
          id="xlsx-file"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
          className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
        {fileName && (
          <p className="text-xs text-muted-foreground">
            Loaded: <span className="font-mono">{fileName}</span> · {preview?.rows.length ?? 0} rows ·
            {' '}
            {preview?.headers.length ?? 0} columns
          </p>
        )}
      </div>

      {preview && (
        <>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Column mapping</h3>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-xs">
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[f.key] ?? NONE_VALUE}
                    onValueChange={(v) => updateMapping(f.key, v === NONE_VALUE ? undefined : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="(unmapped)" />
                    </SelectTrigger>
                    <SelectContent>
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
            <h3 className="text-sm font-medium">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="border-b bg-muted/50 text-left">
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
                    <tr key={i} className="border-b last:border-0">
                      {preview.headers.map((h) => (
                        <td key={h} className="px-2 py-1 font-mono text-[11px]">
                          {String(row[h] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border p-3 text-sm">
            <div>
              <span className="font-medium text-emerald-700">{items.length}</span> rows ready ·{' '}
              <span className="font-medium text-amber-700">{errors.length}</span> rows with errors
            </div>
            {errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Show errors
                </summary>
                <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {errors.slice(0, 20).map((e, i) => (
                    <li key={i}>
                      Row {e.rowIndex + 2}: {e.message}
                    </li>
                  ))}
                  {errors.length > 20 && <li>… and {errors.length - 20} more</li>}
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
