'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, ScanLine, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dispatch } from '@/lib/commands/dispatch'
import { MAX_IMAGES_PER_SESSION, MAX_IMAGE_BYTES } from '@/modules/imports/ingest/types'
import { IMPORT_UPLOAD_URL, INGEST_UNAVAILABLE_MESSAGE } from './source-image'
import type { ProjectView } from './types'

// Two empty states, one component, because they are the same page at two
// moments: no session yet, and a session with nothing in it.

export interface StartImportProps {
  project: ProjectView
}

export function StartImportState({ project }: StartImportProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function start() {
    setCreating(true)
    const result = await dispatch<{ projectId: string }, { sessionId: string }>(
      'import.session.create',
      { projectId: project.id },
    )
    setCreating(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    router.refresh()
  }

  return (
    <EmptyShell
      project={project}
      icon={<ScanLine className="h-6 w-6 text-pfAccentStrong" aria-hidden />}
      title="Turn an image into a measured design"
      body="Upload a dimensioned sketch, a surveyor plat, a concept render, or a backyard photo. Pool Forge reads the shape, the features, and the materials, then hands you every number to confirm before anything reaches the project."
    >
      <Button onClick={start} disabled={creating}>
        {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Start an import
      </Button>
    </EmptyShell>
  )
}

export interface UploadStateProps {
  project: ProjectView
  sessionId: string
}

export function AwaitingImagesState({ project, sessionId }: UploadStateProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)

    const body = new FormData()
    body.append('sessionId', sessionId)
    for (const file of Array.from(files).slice(0, MAX_IMAGES_PER_SESSION)) {
      body.append('files', file)
    }

    try {
      const response = await fetch(IMPORT_UPLOAD_URL, { method: 'POST', body })
      if (!response.ok) {
        setError(
          response.status === 404
            ? INGEST_UNAVAILABLE_MESSAGE
            : `The upload was rejected (HTTP ${response.status}).`,
        )
        return
      }
      router.refresh()
    } catch {
      setError('The upload could not reach the server. Check your connection and try again.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const megabytes = Math.round(MAX_IMAGE_BYTES / (1024 * 1024))

  return (
    <EmptyShell
      project={project}
      icon={<ImagePlus className="h-6 w-6 text-pfAccentStrong" aria-hidden />}
      title="This import has no images yet"
      body={`Add up to ${MAX_IMAGES_PER_SESSION} images, ${megabytes} MB each. JPEG, PNG, WebP, HEIC, and single-page PDF are read. Location data is stripped before anything is stored or analyzed.`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="h-4 w-4" aria-hidden />
        )}
        {uploading ? 'Uploading' : 'Choose images'}
      </Button>
      {error !== null ? (
        <p
          role="alert"
          className="max-w-md rounded-pfXs border border-pfError/25 bg-errorSoft px-3 py-2 text-[11.5px] text-red-800"
        >
          {error}
        </p>
      ) : null}
    </EmptyShell>
  )
}

function EmptyShell({
  project,
  icon,
  title,
  body,
  children,
}: {
  project: ProjectView
  icon: React.ReactNode
  title: string
  body: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="flex max-w-lg flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-pfLg border border-pfAccent/25 bg-pfAccentSoft">
          {icon}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-textMuted">{body}</p>
        </div>
        <div className="flex flex-col items-center gap-2">{children}</div>
        <Link
          href={`/projects/${project.id}`}
          className="text-xs text-textMuted underline underline-offset-2 hover:text-foreground"
        >
          Back to {project.name}
        </Link>
      </div>
    </div>
  )
}
