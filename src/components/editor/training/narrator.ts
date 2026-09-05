// Play one line of Marco's narration and tell the runner when it's done.
//
// Prefer his real voice: fetch the line as audio from /api/training/narration
// (Gemini "Charon") and play it. If that is unavailable (204, network, no
// billing) fall back to the browser's closest steady male voice so the training
// always speaks. Either way `onEnded` fires when the line finishes, so the
// runner can hold each caption until it has actually been spoken rather than
// cutting it off on a fixed timer.

export interface Narration {
  pause(): void
  resume(): void
  /** Stop immediately and free the clip. Does not fire onEnded again. */
  stop(): void
}

/** The closest thing the browser has to Marco's low, measured voice. */
function pickMarcoVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices()
  if (!voices.length) return null
  const en = voices.filter(v => v.lang?.toLowerCase().startsWith('en'))
  const pool = en.length ? en : voices
  const preferred = ['Google UK English Male', 'Daniel', 'Arthur', 'Aaron', 'Alex', 'Microsoft Guy', 'Microsoft David', 'Rishi', 'Google US English']
  for (const name of preferred) {
    const hit = pool.find(v => v.name === name) ?? pool.find(v => v.name.includes(name))
    if (hit) return hit
  }
  return pool.find(v => /\bmale\b/i.test(v.name)) ?? pool[0] ?? null
}

export function narrate(text: string, onEnded: () => void): Narration {
  let audio: HTMLAudioElement | null = null
  let objectUrl: string | null = null
  let stopped = false
  let done = false

  const finish = () => {
    if (done || stopped) return
    done = true
    onEnded()
  }

  const cleanupUrl = () => {
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl)
      } catch {
        /* ignore */
      }
      objectUrl = null
    }
  }

  const speakFallback = () => {
    try {
      const synth = window.speechSynthesis
      if (!synth) {
        finish()
        return
      }
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      const voice = pickMarcoVoice(synth)
      if (voice) u.voice = voice
      u.rate = 0.95
      u.pitch = 0.9
      u.onend = finish
      u.onerror = finish
      synth.speak(u)
    } catch {
      finish()
    }
  }

  void (async () => {
    try {
      const res = await fetch('/api/training/narration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (stopped) return
      const type = res.headers.get('content-type') ?? ''
      if (res.ok && type.includes('audio')) {
        const buf = await res.arrayBuffer()
        if (stopped) return
        objectUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
        audio = new Audio(objectUrl)
        audio.onended = () => {
          cleanupUrl()
          finish()
        }
        audio.onerror = () => {
          cleanupUrl()
          speakFallback()
        }
        await audio.play().catch(() => {
          cleanupUrl()
          speakFallback()
        })
        return
      }
    } catch {
      // fall through to the browser voice
    }
    if (!stopped) speakFallback()
  })()

  return {
    pause() {
      try {
        audio?.pause()
        window.speechSynthesis?.pause()
      } catch {
        /* ignore */
      }
    },
    resume() {
      try {
        if (audio) void audio.play().catch(() => undefined)
        window.speechSynthesis?.resume()
      } catch {
        /* ignore */
      }
    },
    stop() {
      stopped = true
      try {
        if (audio) {
          audio.pause()
          audio.onended = null
          audio.onerror = null
        }
        window.speechSynthesis?.cancel()
      } catch {
        /* ignore */
      }
      cleanupUrl()
    },
  }
}
