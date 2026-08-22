import { z } from 'zod'

// Voice runtime configuration.
//
// The model id is env-driven rather than a constant on purpose: Live API models
// are preview and their ids churn, so a rename should be a deploy variable, not
// a code change and a release.

/**
 * Default Live model.
 *
 * Verify against the project before trusting it — a preview id that has been
 * retired fails at connect time with a 404 that reads like a permissions
 * problem. `pnpm voice:models` probes what the configured project can actually
 * reach.
 */
export const DEFAULT_LIVE_MODEL = 'gemini-live-2.5-flash-native-audio'

/** Live audio is 16 kHz mono PCM16 in, 24 kHz out. Not negotiable by config. */
export const INPUT_SAMPLE_RATE = 16_000
export const OUTPUT_SAMPLE_RATE = 24_000
export const AUDIO_CHANNELS = 1

/**
 * Milliseconds of audio per frame sent upstream.
 *
 * Small enough that barge-in feels immediate, large enough that the socket is
 * not doing per-packet work for a few samples at a time.
 */
export const FRAME_MS = 32

/**
 * How much captured audio may queue before the oldest is dropped.
 *
 * Audio is only useful fresh. An unbounded buffer turns a brief network stall
 * into a conversation that is permanently a few seconds behind, which is worse
 * than losing the stalled moment.
 */
export const MAX_BUFFERED_FRAMES = Math.ceil(2_000 / FRAME_MS)

const schema = z.object({
  project: z.string().min(1, 'GCP_PROJECT_ID is required for voice'),
  location: z.string().min(1).default('us-central1'),
  model: z.string().min(1).default(DEFAULT_LIVE_MODEL),
  /** Live calls are opt-in for the same reason extraction is: they cost money. */
  enabled: z.boolean(),
})

export type VoiceConfig = z.infer<typeof schema>

export interface EnvLike {
  [key: string]: string | undefined
}

function truthy(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized !== '' && normalized !== '0' && normalized !== 'false'
}

/**
 * Read and validate the voice configuration.
 *
 * Fails loudly on a missing project rather than defaulting to something, because
 * the wrong project is a billing and data-residency mistake, not an
 * inconvenience.
 */
export function loadVoiceConfig(env: EnvLike = process.env): VoiceConfig {
  return schema.parse({
    project: env['GCP_PROJECT_ID'],
    location: env['VERTEX_LOCATION'] ?? 'us-central1',
    model: env['VERTEX_LIVE_MODEL'] ?? DEFAULT_LIVE_MODEL,
    enabled: truthy(env['VOICE_LIVE']),
  })
}

/** True when a live session may be opened at all. */
export function voiceEnabled(env: EnvLike = process.env): boolean {
  return truthy(env['VOICE_LIVE']) && Boolean(env['GCP_PROJECT_ID'])
}
