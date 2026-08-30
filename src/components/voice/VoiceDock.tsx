'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { DestructiveConfirm } from '@/components/voice/DestructiveConfirm'
import { registerClientHandler } from '@/lib/commands/dispatch'
import { clickOnPage } from '@/modules/editor/page-click'
import { fillPage, type FillRequest } from '@/modules/editor/page-fill'
import { readPage } from '@/modules/editor/page-read'
import { screenForPath } from '@/modules/voice/scope'
import { useVoiceSession } from '@/modules/voice/client/useVoiceSession'
import { VoiceTranscript } from './VoiceTranscript'
import { Marco, type MarcoState } from './Marco'
import { MarcoActions } from './MarcoActions'
import { GuideHighlight } from './GuideHighlight'
import { useGuideStore } from '@/modules/guide/store'
import { resolveTarget } from '@/modules/guide/resolve'
import { GUIDE_TARGETS, targetById } from '@/modules/guide/targets'

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
  const { status, error, transcript, start, stop, pendingConfirm, decide } = useVoiceSession(
    screen,
    projectId,
    projectName,
  )

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

    // Registered here rather than in the editor's handler block, which is where
    // these started and why they did nothing. That component is mounted only by
    // the editor, so on Customer Uploads or the price book the agent called
    // guide.point, found no handler, and said it was highlighting something
    // while nothing on screen changed. "Where is that" is a question about
    // whatever screen somebody is on, so the answer has to live where the dock
    // lives: everywhere.
    registerClientHandler<{ targets: string[] }, { pointed: string[]; missing: string[] }>(
      'guide.point',
      input => {
        const pointed: string[] = []
        const missing: string[] = []
        for (const id of input.targets) {
          const target = targetById(id)
          // Resolved rather than trusted, so the agent is told which of the
          // things it asked for are not on this screen instead of describing a
          // control nobody can see.
          if (target && resolveTarget(document, target)) pointed.push(id)
          else missing.push(id)
        }
        useGuideStore.getState().point(pointed)
        return { pointed, missing }
      },
    )

    registerClientHandler<Record<string, never>, { cleared: boolean }>('guide.clear', () => {
      useGuideStore.getState().clear()
      return { cleared: true }
    })

    registerClientHandler<
      Record<string, never>,
      { targets: { id: string; name: string; explain: string }[] }
    >('guide.list', () => {
      // Only what is actually on screen. Listing a control that is not here is
      // how an agent ends up confidently describing another page.
      const here = GUIDE_TARGETS.filter(target => resolveTarget(document, target) !== null)
      return {
        targets: here.map(target => ({
          id: target.id,
          name: target.name,
          explain: target.explain,
        })),
      }
    })
  }, [router])

  // Above the early return, or the hook count changes between renders and
  // React tears the component down mid-session with "rendered more hooks than
  // during the previous render".
  const [hovered, setHovered] = useState(false)

  // The dialog renders even when the dock is hidden, because a destructive
  // request outliving the button that started it is still a request.
  if (status === 'unavailable') return <DestructiveConfirm request={pendingConfirm} onDecide={decide} />

  const live = status === 'live'
  const busy = status === 'starting'

  // Marco has more to say than the button did. Speaking is inferred from the
  // last line being his, because the session reports one live status and the
  // difference between listening and answering is the whole point of having a
  // character rather than a dot.
  const lastLine = transcript[transcript.length - 1]
  const marcoState: MarcoState = status === 'error'
    ? 'confused'
    : busy
      ? 'wake'
      : live
        ? (lastLine?.role === 'model' ? 'speaking' : 'listening')
        : 'idle'

  const marcoLabel = status === 'error'
    ? 'Something went wrong. Click to try again.'
    : busy
      ? 'Connecting'
      : live
        ? 'Listening. Click to stop.'
        : 'Talk to Marco'

  return (
    <>
      <DestructiveConfirm request={pendingConfirm} onDecide={decide} />
      <GuideHighlight />
      <div
        className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
      {live ? <VoiceTranscript lines={transcript} /> : null}

      {error && (
        <p className="pointer-events-auto max-w-80 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow">
          {error}
        </p>
      )}

      {/* Offered on hover, and only while he is not already in a conversation:
          a menu over a live session is chrome in the way of the thing it opened. */}
      <MarcoActions visible={hovered && !live && !busy} onTalk={() => void start()} />

      <button
        type="button"
        // `start` opens the AudioContext and asks for the microphone, both of
        // which the browser only allows from inside this handler.
        onClick={() => void (live ? stop() : start())}
        disabled={busy}
        aria-pressed={live}
        aria-label={marcoLabel}
        title={marcoLabel}
        // No pill, no label, no shadow: he stands on the drawing rather than on
        // a button drawn over it. The hit area is his own bounding box and
        // nothing more, which is the smallest thing this can cost the canvas.
        className={[
          'pointer-events-auto flex items-end justify-center rounded-md p-1 transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600',
          'disabled:opacity-60',
          live ? 'opacity-100' : 'opacity-90 hover:opacity-100',
        ].join(' ')}
      >
        <Marco state={marcoState} />
      </button>
      </div>
    </>
  )
}
