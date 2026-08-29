'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, ScanLine, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { dispatch } from '@/lib/commands/dispatch'
import { MAX_IMAGES_PER_SESSION, MAX_IMAGE_BYTES, UPLOAD_FILE_FIELD } from '@/modules/imports/ingest/types'
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
      icon={<ScanLine className="h-6 w-6 text-family-accent" aria-hidden />}
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
      body.append(UPLOAD_FILE_FIELD, file)
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
  const { dragging, dropProps } = useFileDrop((files) => void upload(files), uploading)

  return (
    <EmptyShell
      project={project}
      icon={<ImagePlus className="h-6 w-6 text-family-accent" aria-hidden />}
      title="This import has no images yet"
      body={`Drag images in, or choose them. Up to ${MAX_IMAGES_PER_SESSION}, ${megabytes} MB each. JPEG, PNG, WebP, HEIC, and single-page PDF are read. Location data is stripped before anything is stored or analyzed.`}
      dropProps={dropProps}
      dragging={dragging}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void upload(e.target.files)}
      />
      {/* A labelled target, not just a page that happens to accept a drop.
          Somewhere to aim is the difference between discovering the feature and
          not knowing it exists. */}
      <div
        className={
          'flex w-full flex-col items-center gap-2 rounded-brand16 border-2 border-dashed px-6 py-6 transition duration-brand ease-brand ' +
          (dragging
            ? 'border-family-accent bg-family-tint'
            : 'border-theme-line bg-transparent hover:border-family-accent/50')
        }
      >
        <p className="text-bodyS text-theme-muted">
          {dragging ? 'Drop to add them' : 'Drag images here'}
        </p>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="h-4 w-4" aria-hidden />
          )}
          {uploading ? 'Uploading' : 'Choose images'}
        </Button>
      </div>
      {error !== null ? (
        <p
          role="alert"
          className="max-w-md rounded-brand4 border border-brand-red/25 bg-tint-blush px-3 py-2 text-bodyS text-theme-fg"
        >
          {error}
        </p>
      ) : null}
    </EmptyShell>
  )
}

/**
 * Accept files dropped anywhere on the page.
 *
 * Dragging an image onto a window whose only affordance is a button is what
 * people try first, and a browser's default is to navigate away from the app and
 * open the file on its own — losing the page rather than doing nothing. So the
 * document-level handlers exist even when the drop lands outside the target:
 * one to accept it, and one to make sure a near miss is a no-op instead of a
 * navigation.
 */
export function useFileDrop(onFiles: (files: FileList) => void, disabled = false): {
  dragging: boolean
  dropProps: {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
} {
  const [dragging, setDragging] = useState(false)
  // Counted rather than a boolean: dragging over a child fires leave on the
  // parent, so a single flag flickers off halfway across the zone.
  const depth = useRef(0)

  useEffect(() => {
    const swallow = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
    }
    document.addEventListener('dragover', swallow)
    document.addEventListener('drop', swallow)
    return () => {
      document.removeEventListener('dragover', swallow)
      document.removeEventListener('drop', swallow)
    }
  }, [])

  const hasFiles = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types).includes('Files')

  return {
    dragging,
    dropProps: {
      onDragOver: (e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        // Tells the cursor this is a copy, not a move or a link.
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragEnter: (e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      },
      onDragLeave: (e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      },
      onDrop: (e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files)
      },
    },
  }
}

function EmptyShell({
  project,
  icon,
  title,
  body,
  children,
  dropProps,
  dragging = false,
}: {
  project: ProjectView
  icon: React.ReactNode
  title: string
  body: string
  children: React.ReactNode
  dropProps?: {
    onDragOver: (e: React.DragEvent) => void
    onDragEnter: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
  dragging?: boolean
}) {
  return (
    // The whole panel is the target, not only the dashed box. Aiming at a small
    // rectangle is a needless miss when the page has nothing else on it.
    <div
      data-accent="azure"
      {...dropProps}
      className={
        'flex min-h-[70vh] items-center justify-center bg-theme-bg px-6 py-16 transition duration-brand ease-brand ' +
        (dragging ? 'bg-family-tint/40' : '')
      }
    >
      <div className="flex max-w-lg flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-brand16 border border-family-accent/25 bg-family-tint">
          {icon}
        </div>
        <div>
          <h1 className="text-title3 font-medium text-theme-fg">{title}</h1>
          <p className="mt-2 text-bodyL leading-relaxed text-theme-muted">{body}</p>
        </div>
        <div className="flex flex-col items-center gap-2">{children}</div>
        <Link
          href={`/projects/${project.id}`}
          className="text-bodyS text-theme-muted underline underline-offset-2 hover:text-theme-fg"
        >
          Back to {project.name}
        </Link>
      </div>
    </div>
  )
}
