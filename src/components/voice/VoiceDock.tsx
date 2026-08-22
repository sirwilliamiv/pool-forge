'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { registerClientHandler } from '@/lib/commands/dispatch'
import { clickOnPage } from '@/modules/editor/page-click'
import { fillPage, type FillRequest } from '@/modules/editor/page-fill'
import { readPage } from '@/modules/editor/page-read'
import { screenForPath } from '@/modules/voice/scope'
import { useVoiceSession } from '@/modules/voice/client/useVoiceSession'

interface ClickReport {
  label: string
  clicked: boolean
  reason: string | null
  available: string[] | null
  needsConfirmation: boolean
}

interface FillReport {
  results: { label: string; value: string; filled: boolean; reason: string | null }[]
  filled: number
  missed: number
}

// The microphone, and what it heard.
//
// Rendered in the app shell rather than per page so a session survives
// navigation: the agent's first useful trick is "take me to the price book",
// which would end the call if this unmounted on the way.

/**
 * The project's name as the page shows it.
 *
 * Read from the document rather than threaded through props: the dock is
 * mounted in the shell, which knows the route and nothing about the project.
 */
function useProjectName(projectId: string | undefined): string | undefined {
  const [name, setName] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!projectId) {
      setName(undefined)
      return
    }
    // After paint, so the heading has rendered.
    const timer = setTimeout(() => {
      const heading = document.querySelector('main h1, header a[href^="/projects/"]')
      setName(heading?.textContent?.trim() || undefined)
    }, 300)
    return () => clearTimeout(timer)
  }, [projectId])

  return name
}

/** `/projects/<id>/...` is the only place a project id lives in a URL. */
function projectIdFrom(pathname: string): string | undefined {
  return /^\/projects\/([^/]+)/.exec(pathname)?.[1]
}

export function VoiceDock() {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const screen = useMemo(() => screenForPath(pathname), [pathname])
  const projectId = useMemo(() => projectIdFrom(pathname), [pathname])

  // The project name comes from the page itself. The dock sits in the shell and
  // has no props, and the agent saying "the Phone Demo project" rather than a
  // cuid is the difference between it sounding aware and sounding lost.
  const projectName = useProjectName(projectId)
  const { status, error, transcript, start, stop } = useVoiceSession(screen, projectId, projectName)

  // The navigation commands resolve a path and let the client route. Registering
  // the handlers here means `nav.goto` works from the command palette too, and
  // `<Link>`-equivalent routing keeps the app shell alive across the move.
  useEffect(() => {
    const go = (_input: unknown, serverData: unknown) => {
      const path = (serverData as { path?: string } | undefined)?.path
      if (path) router.push(path)
      return serverData
    }
    registerClientHandler('nav.goto', go)
    registerClientHandler('nav.openProject', go)

    // Registered here rather than in the editor's handler block: "what does this
    // say" is a question about whatever screen the user is on, and the editor is
    // the one screen where it is least needed.
    registerClientHandler<{ query?: string }, ReturnType<typeof readPage>>(
      'page.read',
      input => readPage(undefined, input.query),
    )

    // Async because a component-library select has to be opened and clicked;
    // its value cannot be assigned.
    registerClientHandler<{ fields: FillRequest[] }, FillReport>('page.fill', async input => {
      const outcomes = await fillPage(input.fields)
      const results = outcomes.map(({ reason, ...rest }) => ({
        ...rest,
        // Explicit null rather than an absent key: the model is told what went
        // wrong, and "reason omitted" reads as "no reason" to a schema.
        reason: reason ?? null,
      }))
      return {
        results,
        filled: results.filter(result => result.filled).length,
        missed: results.filter(result => !result.filled).length,
      }
    })

    registerClientHandler<{ label: string; confirm?: boolean }, ClickReport>(
      'page.click',
      input => {
        const result = clickOnPage(input.label, input.confirm === true)
        return {
          label: result.label,
          clicked: result.clicked,
          reason: result.reason ?? null,
          available: result.available ?? null,
          needsConfirmation: result.needsConfirmation === true,
        }
      },
    )
  }, [router])

  if (status === 'unavailable') return null

  const live = status === 'live'
  const busy = status === 'starting'

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {transcript.length > 0 && live && (
        <div className="pointer-events-auto max-h-64 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white/95 p-3 text-sm shadow-lg backdrop-blur">
          {transcript.map(line => (
            <p
              key={line.id}
              className={line.role === 'user' ? 'mb-1 text-slate-900' : 'mb-1 text-slate-500'}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}

      {error && (
        <p className="pointer-events-auto max-w-80 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow">
          {error}
        </p>
      )}

      <button
        type="button"
        // `start` opens the AudioContext and asks for the microphone, both of
        // which the browser only allows from inside this handler.
        onClick={() => void (live ? stop() : start())}
        disabled={busy}
        aria-pressed={live}
        aria-label={live ? 'Stop talking to Pool Forge' : 'Talk to Pool Forge'}
        className={[
          'pointer-events-auto flex h-12 items-center gap-2 rounded-full px-5 text-sm font-medium shadow-lg transition',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600',
          live
            ? 'bg-rose-600 text-white hover:bg-rose-700'
            : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'h-2.5 w-2.5 rounded-full',
            live ? 'animate-pulse bg-white' : 'bg-emerald-400',
          ].join(' ')}
        />
        {busy ? 'Starting…' : live ? 'Listening' : 'Talk'}
      </button>
    </div>
  )
}
