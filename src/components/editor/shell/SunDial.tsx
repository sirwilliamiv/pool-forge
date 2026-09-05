'use client'

import { Play, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { dispatch } from '@/lib/commands/dispatch'
import {
  formatClockTime,
  useSunStore,
} from '@/modules/editor/state/sunStore'

const TRACK_GRADIENT =
  'linear-gradient(90deg, #1e1b4b 0%, #4c1d95 12%, #c2410c 28%, #f59e0b 50%, #c2410c 72%, #4c1d95 88%, #1e1b4b 100%)'

export function SunDial() {
  const minutes = useSunStore((s) => s.minutesPastMidnight)
  const sunrise = useSunStore((s) => s.sunrise)
  const sunset = useSunStore((s) => s.sunset)
  const setMinutes = useSunStore((s) => s.setMinutes)

  const span = Math.max(1, sunset - sunrise)
  const sliderValue = Math.round(((minutes - sunrise) / span) * 100)

  const [dragging, setDragging] = useState(false)
  const lastDispatched = useRef(minutes)

  useEffect(() => {
    if (!dragging) lastDispatched.current = minutes
  }, [dragging, minutes])

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value)
    const next = Math.round(sunrise + (v / 100) * span)
    setMinutes(next)
  }

  async function commit() {
    setDragging(false)
    const current = useSunStore.getState().minutesPastMidnight
    if (current === lastDispatched.current) return
    lastDispatched.current = current
    await dispatch('sun.set.time', { minutesPastMidnight: current })
  }

  return (
    <div
      className="pointer-events-auto w-[200px] rounded-pfMd border border-border bg-white p-3 shadow-pfMd"
      role="group"
      aria-label="Sun study"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-textMuted">
          <Sun className="h-3 w-3" aria-hidden />
          <span>Sun study</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Play the sun across the day"
            aria-label="Play sun study"
            className="text-textFaint transition-colors hover:text-foreground"
            onClick={() => void dispatch('sun.run.study', {})}
          >
            <Play className="h-3 w-3" aria-hidden />
          </button>
          <div className="font-mono text-[11px] tabular-nums text-foreground">
            {formatClockTime(minutes)}
          </div>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={sliderValue}
        aria-label="Time of day"
        className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full focus:outline-none focus:ring-2 focus:ring-pfAccent"
        style={{ background: TRACK_GRADIENT }}
        onPointerDown={() => setDragging(true)}
        onChange={handleInput}
        onPointerUp={commit}
        onBlur={commit}
        onKeyUp={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') void commit()
        }}
      />

      <div className="mt-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-textFaint">
        <span>Sunrise {formatClockTime(sunrise)}</span>
        <span>Sunset {formatClockTime(sunset)}</span>
      </div>
    </div>
  )
}
