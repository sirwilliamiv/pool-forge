// What the customer's link is showing, on the builder's copy of the same page.
//
// The builder looks at a live render. The customer looks at a file. Those two
// diverge the moment anybody touches a price or a dimension, and there was no
// way to tell from this screen that they had. This is that way: when it was
// sent, how big the file is, its fingerprint, and a link to the file itself.

const fmtDateTime = (d: Date) =>
  d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toLocaleString('en-US', { maximumFractionDigits: 1 })} KB`
}

export function SentCopyNotice({
  generatedAt,
  byteSize,
  contentHash,
  href,
}: {
  generatedAt: Date
  byteSize: number
  contentHash: string
  href: string
}) {
  return (
    <div className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium text-slate-900">Copy on file</span> from{' '}
          {fmtDateTime(generatedAt)}. This is what the customer&rsquo;s link shows, whatever this
          page renders today.
        </span>
        <a href={href} className="font-medium text-slate-900 underline">
          Open the copy that was sent
        </a>
      </div>
      <div className="mt-1 font-mono text-[10px] text-slate-500">
        {fmtBytes(byteSize)} · sha256 {contentHash.slice(0, 16)}…
      </div>
    </div>
  )
}
