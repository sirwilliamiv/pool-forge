import Link from 'next/link'

// Neutral family: docs and changelogs, per the brand bible. Reference
// material wants a comfortable measure rather than the full page width, so
// prose lives in a capped column while the metadata (labels, ids, statuses)
// takes the mono face.

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-accent="neutral" className="mx-auto max-w-content px-6 py-10">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[200px_1fr] md:gap-12">
        <aside className="flex gap-1 overflow-x-auto md:block md:space-y-1 md:overflow-visible">
          <div className="hidden shrink-0 px-2 pb-2 font-brandMono text-formLabel uppercase text-theme-faint md:block">
            Reference
          </div>
          <DocsLink href="/docs/tools" label="Tools" />
          <DocsLink href="/docs/commands" label="Commands" />
        </aside>
        <main className="min-w-0 max-w-[42rem]">{children}</main>
      </div>
    </div>
  )
}

function DocsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-brand px-2 py-1.5 text-bodyS text-theme-muted transition-colors duration-brand ease-brand hover:bg-theme-card hover:text-theme-fg"
    >
      {label}
    </Link>
  )
}
