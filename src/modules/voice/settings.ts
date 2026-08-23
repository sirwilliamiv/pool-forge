import { z } from 'zod'

// What voice is allowed to do without asking.
//
// The spoken confirmation is a good gate and not a sufficient one: it is the
// agent deciding that the user agreed, from audio it may have misheard. A modal
// is the user themselves saying yes, with the thing that will be lost written
// down in front of them.
//
// So the modal is the default and the spoken gate is the fallback, not the other
// way around. Turning it off is a real choice a builder can make once they trust
// it, and it is theirs to make rather than the agent's.

export const VOICE_SETTINGS_KEY = 'voice'

export const voiceSettingsSchema = z.object({
  /**
   * Show a dialog before voice deletes or replaces anything.
   *
   * On by default. A misheard sentence that reaches a delete is the failure
   * this exists for, and it has already happened once: a project was deleted
   * from a single spoken sentence because the model wrote its own confirmation.
   */
  confirmDestructive: z.boolean().default(true),
})

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { confirmDestructive: true }

/**
 * Read the stored settings, tolerating anything.
 *
 * A row that has never been written, a value from an older shape, or corrupt
 * JSON all have to resolve to the safe default rather than throwing, because
 * the alternative is a broken settings read turning the confirmation off.
 */
export function parseVoiceSettings(raw: unknown): VoiceSettings {
  const parsed = voiceSettingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : DEFAULT_VOICE_SETTINGS
}
