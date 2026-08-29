'use client'

import { useEffect, useRef } from 'react'

/**
 * Marco, the assistant.
 *
 * Named for the pool game, because you call his name and he answers, which is
 * what a voice assistant does and what every customer who has been in a pool
 * already understands. The character is Addy, vendored from inbox-buddy rather
 * than rebuilt: one navy blob with crescent eyes, a metallic sheen, twelve
 * states and a gooey morph between them.
 *
 * He also knows how to point, at one element with `pointAt` and at several at
 * once with `swarm`. That is what makes him the right body for the guide specced
 * in `docs/guide-agent-plan.md` rather than only a nicer microphone glyph: the
 * guide has to show somebody where a control is, and he can point at it.
 *
 * He draws into canvases with `pointerEvents: none`, which is the property that
 * matters most here. He stands over the drawing without taking a single click
 * away from it, and on this product the drawing is the whole point.
 *
 * Loaded on demand: 57KB of animation that nobody who never opens voice should
 * have to download.
 */

/** What the character can be. Twelve, from the original's vocabulary. */
export type MarcoState =
  | 'idle'
  | 'wake'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'success'
  | 'celebrate'
  | 'notify'
  | 'confused'
  | 'tired'
  | 'dormant'

/** The vendored character's own surface, which Marco is a thin skin over. */
interface CharacterInstance {
  set(state: MarcoState): Promise<void>
  pointAt(target: Element | string): Promise<void>
  swarm(targets: (Element | string)[], opts?: Record<string, unknown>): Promise<void>
  recall(): Promise<void>
  destroy(): void
  amp: number
  energy: number
}

interface Props {
  state: MarcoState
  size?: number
  /** Live microphone amplitude, 0..1. Drives how much he reacts while listening. */
  amplitude?: number
}

export function Marco({ state, size = 132, amplitude = 0 }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const characterRef = useRef<CharacterInstance | null>(null)
  // The state asked for before he finished loading, so nothing is dropped.
  const pendingRef = useRef<MarcoState>(state)

  useEffect(() => {
    let cancelled = false
    const stage = stageRef.current
    if (!stage) return

    void (async () => {
      try {
        const loaded = (await import('@/vendor/marco/character.js')) as {
          default: new (stage: HTMLElement, opts: { size: number }) => CharacterInstance
        }
        if (cancelled || !stageRef.current) return
        const instance = new loaded.default(stageRef.current, { size })
        characterRef.current = instance
        void instance.set(pendingRef.current)
      } catch {
        // He is decoration on top of a working feature. A character that fails
        // to draw must never take the voice session down with it, so the button
        // is left empty and still works.
      }
    })()

    return () => {
      cancelled = true
      characterRef.current?.destroy()
      characterRef.current = null
    }
  }, [size])

  useEffect(() => {
    pendingRef.current = state
    void characterRef.current?.set(state)
  }, [state])

  useEffect(() => {
    if (characterRef.current) characterRef.current.amp = amplitude
  }, [amplitude])

  return (
    <div
      ref={stageRef}
      // The stage is the coordinate space he positions himself in, and it never
      // takes a pointer event: the canvases inside set the same, so a click over
      // him lands on whatever he is standing on.
      style={{
        position: 'relative',
        width: size,
        height: size,
        pointerEvents: 'none',
      }}
    />
  )
}
