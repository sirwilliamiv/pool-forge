// A rolling memory of what the assistant did and heard, so a reload or a new
// session starts with "you were pricing the Jones project" instead of
// amnesia. sessionStorage on purpose: it dies with the tab, which is the
// right lifetime for a conversation, and it never crosses users on a shared
// machine the way localStorage would.

const KEY = 'pf.voice.journal'
const MAX_ENTRIES = 15

interface Journal {
  summary: string
  commands: { id: string; result: string; at: number }[]
}

function load(): Journal {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Journal
  } catch {
    // Storage can be unavailable (private windows, test environments).
  }
  return { summary: '', commands: [] }
}

function save(journal: Journal): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(journal))
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
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}
