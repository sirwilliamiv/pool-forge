import { auth } from '@/lib/auth'
import { TopNav } from '@/components/dashboard/TopNav'
import { VoiceDock } from '@/components/voice/VoiceDock'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1">{children}</main>
      {/* Signed in only, checked here rather than trusted to the middleware.
          The docs pages sit in this group and are deliberately public, so the
          middleware lets an anonymous visitor through and the shell renders
          around them: without this check a stranger gets an assistant who
          cannot do anything, because every command behind him is org-scoped and
          the surfaces route answers 401. A control that is present and cannot
          work is worse than one that is absent.

          It also lives in the shell so a session survives navigation: "take me
          to the price book" would otherwise end the call it was issued from. */}
      {session?.user ? <VoiceDock /> : null}
    </div>
  )
}
