import { create } from 'zustand'

export interface SunState {
  minutesPastMidnight: number
  sunrise: number
  sunset: number
  setMinutes: (n: number) => void
  setSunriseSunset: (rise: number, set: number) => void
}

export const useSunStore = create<SunState>((set) => ({
  minutesPastMidnight: 12 * 60,
  sunrise: 6 * 60 + 21,
  sunset: 20 * 60 + 31,
  setMinutes: (minutesPastMidnight) => set({ minutesPastMidnight }),
  setSunriseSunset: (sunrise, sunset) => set({ sunrise, sunset }),
}))

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function dayT(state: SunState): number {
  const span = state.sunset - state.sunrise
  if (span <= 0) return 0.5
  return clamp01((state.minutesPastMidnight - state.sunrise) / span)
}

export function selectSunDirection(state: SunState): [number, number, number] {
  const t = dayT(state)
  const angle = t * Math.PI
  const x = Math.cos(angle - Math.PI / 2) * 40
  const y = Math.sin(angle) * 40 + 5
  const z = 16
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

export function selectSunColor(state: SunState): [number, number, number] {
  const t = dayT(state)
  const noon = 1 - Math.abs(t - 0.5) * 2
  return [1.0, 0.85 + noon * 0.13, 0.6 + noon * 0.32]
}

export function selectSunIntensity(state: SunState): number {
  const t = dayT(state)
  const noon = 1 - Math.abs(t - 0.5) * 2
  return 0.5 + noon * 0.7
}

export function formatClockTime(minutesPastMidnight: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutesPastMidnight)))
  const h24 = Math.floor(m / 60)
  const min = m % 60
  const period = h24 >= 12 ? 'p' : 'a'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${min.toString().padStart(2, '0')}${period}`
}
