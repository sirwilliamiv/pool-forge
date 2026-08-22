import { TopNav } from '@/components/dashboard/TopNav'
import { VoiceDock } from '@/components/voice/VoiceDock'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">{children}</main>
      {/* Lives in the shell so a session survives navigation: "take me to the
          price book" would otherwise end the call it was issued from. */}
      <VoiceDock />
    </div>
  )
}
