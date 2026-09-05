// Marco's voice for the training, in his real voice.
//
// The live voice session speaks with Gemini's "Charon" (see modules/voice
// config). The training runs with the mic off and no live session, so instead
// of a live socket it asks Gemini for one-shot speech in the same voice and
// plays the clip. The lines are fixed, so the first render of each is cached
// and every later run (and every later user) is free.
//
// Vertex only, never the consumer endpoint — the repo rule for anything that
// touches an AI model. If synthesis is unavailable the caller falls back to a
// browser voice, so the training always speaks.

import { createHash } from 'node:crypto'
import type { GoogleGenAI } from '@google/genai'

import { isLiveEnabled, loadVisionConfig } from '@/modules/imports/vision/client'

/** The voice the live Marco session uses. Kept in step with modules/voice. */
const MARCO_VOICE = process.env['VOICE_NAME']?.trim() || 'Charon'

/** Preview TTS lives in us-central1; the vision path may run in `global`. */
const TTS_LOCATION = process.env['TTS_LOCATION']?.trim() || 'us-central1'
const TTS_MODEL = process.env['TTS_MODEL']?.trim() || 'gemini-2.5-flash-preview-tts'

export interface NarrationClip {
  /** WAV bytes, ready to hand to an <audio> element. */
  wav: Buffer
}

const cache = new Map<string, NarrationClip>()
let client: GoogleGenAI | null = null

async function getClient(projectId: string): Promise<GoogleGenAI> {
  if (client) return client
  const mod = await import('@google/genai')
  client = new mod.GoogleGenAI({ vertexai: true, project: projectId, location: TTS_LOCATION })
  return client
}

/**
 * Speak one line in Marco's voice, as WAV. Returns null when synthesis is off
 * or fails — the caller then uses a browser voice rather than going silent.
 */
export async function synthesizeNarration(text: string): Promise<NarrationClip | null> {
  const key = createHash('sha256').update(`${MARCO_VOICE}:${TTS_MODEL}:${text}`).digest('hex')
  const hit = cache.get(key)
  if (hit) return hit

  if (!isLiveEnabled()) return null
  const config = loadVisionConfig()

  try {
    const ai = await getClient(config.projectId)
    const res = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: MARCO_VOICE } } },
      },
    })
    const part = res.candidates?.[0]?.content?.parts?.[0]
    const data = part?.inlineData?.data
    if (!data) return null
    const pcm = Buffer.from(data, 'base64')
    const rate = rateFromMime(part.inlineData?.mimeType) ?? 24000
    const clip: NarrationClip = { wav: pcmToWav(pcm, rate) }
    cache.set(key, clip)
    return clip
  } catch {
    // Never propagate the raw model/transport error; the caller falls back.
    return null
  }
}

/** Gemini returns raw PCM as e.g. `audio/L16;rate=24000`. Pull the rate out. */
function rateFromMime(mime: string | undefined): number | null {
  const m = mime?.match(/rate=(\d+)/)
  return m ? Number(m[1]) : null
}

/** Wrap 16-bit mono PCM in a minimal WAV container so a browser can play it. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const channels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}
