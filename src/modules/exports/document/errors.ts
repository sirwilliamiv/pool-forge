import { randomBytes } from 'node:crypto'

// One sentence for the person, one reference for the server log.
//
// Nothing a renderer, a filesystem or a database driver says is ever shown to a
// user or written into an audit row: a path, a connection string or a query
// fragment in a toast is a leak, and "ENOENT: no such file or directory, open
// '/var/…'" is not a sentence a builder can act on anyway. The reference is the
// only thing that crosses the boundary, and it is enough to find the log line.

export interface ExportFailure {
  ref: string
  message: string
}

function reference(): string {
  return `err_${randomBytes(6).toString('hex')}`
}

/**
 * Log the real cause against a fresh reference and return the sentence the
 * caller is allowed to pass on.
 */
export function exportFailure(stage: string, err: unknown, message: string): ExportFailure {
  const ref = reference()
  const name = err instanceof Error ? err.name : typeof err
  const detail = err instanceof Error ? err.message : String(err)
  console.error(`[exports] ${stage} failed (${ref}): ${name}: ${detail}`)
  return { ref, message: `${message} (reference ${ref})` }
}
