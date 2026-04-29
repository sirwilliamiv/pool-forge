import Link from 'next/link'

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container py-6">
      <div className="grid grid-cols-[180px_1fr] gap-8">
        <aside className="space-y-1">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reference
          </div>
          <DocsLink href="/docs/tools" label="Tools" />
          <DocsLink href="/docs/commands" label="Commands" />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  )
}

function DocsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      {label}
    </Link>
  )
}
