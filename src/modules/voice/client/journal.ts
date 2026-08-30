// A rolling memory of what the assistant did and heard, so a reload or a new
// session starts with "you were pricing the Jones project" instead of
// amnesia. sessionStorage on purpose: it dies with the tab, which is the
// right lifetime for a conversation.
//
// sessionStorage on its own does NOT keep this from crossing users on a
// shared machine: it survives a same-tab sign-out/sign-in, which a fixed key
// would happily carry across. The key is folded together with the signed-in
// identity (`${orgId}:${userId}`, set via `setJournalIdentity`) so a journal
// written under one identity lives at a different slot than any other
// identity's journal and is never read back for someone else. Call
// `setJournalIdentity` as soon as the identity is known (the app shell does
// this); until then everything reads and writes an `anon` slot that no
// authenticated session ever resolves to.

const KEY_PREFIX = 'pf.voice.journal'
const MAX_ENTRIES = 15

let currentIdentity = 'anon'

interface Journal {
  summary: string
  commands: { id: string; result: string; at: number }[]
}

/** Call with `${orgId}:${userId}` (or any stable per-identity string) as soon as it is known. */
export function setJournalIdentity(identity: string): void {
  currentIdentity = identity || 'anon'
}

function storageKey(): string {
  return `${KEY_PREFIX}:${currentIdentity}`
}

function load(): Journal {
  try {
    const raw = sessionStorage.getItem(storageKey())
    if (raw) return JSON.parse(raw) as Journal
  } catch {
    // Storage can be unavailable (private windows, test environments).
  }
  return { summary: '', commands: [] }
}

function save(journal: Journal): void {
  try {
    sessionStorage.setItem(storageKey(), JSON.stringify(journal))
  } catch {
    // Best effort. A journal that cannot persist is still a journal for this page.
  }
}

export function recordCommand(id: string, spokenResult: string): void {
  const journal = load()
  journal.commands.push({ id, result: spokenResult.slice(0, 160), at: Date.now() })
  journal.commands = journal.commands.slice(-MAX_ENTRIES)
  save(journal)
}

export function recordSummary(line: string): void {
  const journal = load()
  journal.summary = line.slice(0, 300)
  save(journal)
}

export function readJournal(): string {
  const journal = load()
  const parts: string[] = []
  if (journal.summary) parts.push(journal.summary)
  if (journal.commands.length > 0) {
    parts.push(
      'Recent actions this session: ' +
        journal.commands.map(entry => entry.result).join('; ') + '.',
    )
  }
  return parts.join(' ').slice(0, 900)
}

export function clearJournal(): void {
  try {
    sessionStorage.removeItem(storageKey())
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
