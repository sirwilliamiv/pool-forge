import { redirect } from 'next/navigation'

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { VoiceSettingsForm } from '@/components/settings/VoiceSettingsForm'
import { parseVoiceSettings, VOICE_SETTINGS_KEY } from '@/modules/voice/settings'

export const dynamic = 'force-dynamic'

export default async function VoiceSettingsPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const orgId = session.user.orgId
  if (!orgId) redirect('/login')

  const stored = await db.appSetting.findUnique({
    where: { orgId_key: { orgId, key: VOICE_SETTINGS_KEY } },
    select: { value: true },
  })

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Voice</h1>
      <p className="mt-2 text-sm text-textMuted">
        How much the voice assistant is allowed to do without stopping to ask.
      </p>
      <div className="mt-6">
        <VoiceSettingsForm initial={parseVoiceSettings(stored?.value)} />
      </div>
    </main>
  )
}
