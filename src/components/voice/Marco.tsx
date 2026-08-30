'use client'

import { useEffect, useRef } from 'react'

import { INK, SPECTRUM } from '@/lib/brand'

/**
 * Marco, the assistant.
 *
 * Named for the pool game, because you call his name and he answers, which is
 * what a voice assistant does and what every customer who has been in a pool
 * already understands. The character is Addy, vendored from inbox-buddy rather
 * than rebuilt: one dark blob with crescent eyes, a metallic sheen, twelve
 * states and a gooey morph between them, recoloured to the brand spectrum by
 * the palette below.
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

/**
 * Marco in Pool Forge colours.
 *
 * He arrived wearing the palette of the product he was built for: a navy body,
 * a mid-blue badge, and six jewel tones for the ribbons and the comet. Read
 * against `docs/brand-bible.md` that is the azure family with the volume down,
 * and it made the one animated thing in the product the one thing not on brand.
 *
 * So he gets the spectrum instead, and gets it the only legitimate way: passed
 * in from `lib/brand.ts` at construction. The hexes stay in one file, the
 * vendored character keeps its zero dependencies, and nothing here is a second
 * copy of a brand colour that can drift from the first.
 *
 * `body` is green because green is the one core hue the bible lets run
 * full-bleed as a surface, and the puck is a surface. Black and purple were the
 * other two candidates in the crit: black is the safest and lets the ribbons
 * pop hardest, purple is the boldest and costs a little eye contrast. Green
 * also happens to be the accent of the `signal` family the app already wears,
 * so he matches the room he stands in.
 *
 * `ink` stays black rather than navy: that is the swarm pins, which are small
 * and read as marks on the page, and the chassis is black on white. The rest of
 * the colour is spent where the bible spends it, on the earned moments.
 * Ribbons, orbits, the comet and the confetti run the five hues.
 *
 * The order matters. `spectrum[b * 2]` picks the working orbits, so consecutive
 * entries land next to each other and the list alternates warm and cool to keep
 * any two neighbours apart.
 *
 * Red and orange appear here, which they must not do on a control: amber means
 * a warning and red means an error, and a highlighted button in either reads as
 * something being wrong. This is illustration, where the bible allows all five,
 * with one exception held below.
 */
const BRAND_PALETTE = {
  body: SPECTRUM.green,
  ink: INK.black,
  paper: INK.paper,
  // The ring he pings onto a real control when he points at it, so it is
  // emphatically not red or amber: it is the UI blue, which is what this
  // product already uses to mean "here".
  accent: SPECTRUM.uiBlue,
  fringeWarm: SPECTRUM.orange,
  fringeHot: SPECTRUM.red,
  fringeCool: SPECTRUM.blue,
  spectrum: [
    SPECTRUM.green,
    SPECTRUM.orange,
    SPECTRUM.blue,
    SPECTRUM.red,
    SPECTRUM.purple,
    SPECTRUM.uiBlue,
  ],
} as const

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
          default: new (
            stage: HTMLElement,
            opts: { size: number; palette: typeof BRAND_PALETTE },
          ) => CharacterInstance
        }
        if (cancelled || !stageRef.current) return
        const instance = new loaded.default(stageRef.current, { size, palette: BRAND_PALETTE })
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
