// Redaction for anything that is about to be written to a log line or sent to
// an alert sink.
//
// Pool Forge holds homeowners' names, street addresses, phone numbers, email
// addresses and contract totals. Any of those can end up inside an error
// message: a Prisma unique-constraint violation quotes the offending value, a
// validation error quotes the field it rejected, a thrown `Error` built with a
// template literal carries whatever was in scope. So no free-form text reaches
// a sink without passing through here.
//
// Three layers, in this order:
//
//  1. `scrubErrorText` from `./scrub`, which already removes
//     credential material (private keys, ya29 tokens, AIza keys, JWTs, bearer
//     headers, tokenised URLs, inline base64) plus email addresses and IP
//     addresses, and caps the length. It is imported rather than reimplemented:
//     one scrubber, one place to add a pattern to.
//  2. Money, long digit runs and telephone shapes, which is what a contract
//     figure, a postcode, a card fragment and a phone number look like.
//  3. Proper nouns. Every capitalised word that is not in the technical
//     vocabulary below becomes `[redacted-name]`. That is deliberately blunt:
//     "Margaret Fitzwilliam", "Willow Creek Drive" and "Fitzwilliam" all go,
//     at the cost of occasionally eating an ordinary English word.
//
// Limits worth stating plainly. Layer 3 is a heuristic: an all-lowercase name
// survives it. The real control is the convention this repo already follows,
// that user-facing and logged messages are canned strings plus opaque ids and
// never interpolate customer values; the redactor is the second line, for the
// messages nobody wrote on purpose. And an error's *structure* is what
// monitoring actually reports: a code, a masked route, an error name and a
// fingerprint. The message is the least trusted field in the record.

import { scrubErrorText } from './scrub'

/** Hard ceiling on anything leaving this module. */
export const MAX_REDACTED_LENGTH = 600

const AMOUNT_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Currency-symbol amounts: $48,750.00, £1,200, €95
  { pattern: /[$£€¥]\s?\d[\d,_]*(?:\.\d+)?/g, replacement: '[redacted-amount]' },
  // Bare decimal money, with or without thousands separators: 48,750.00 / 1250.5
  { pattern: /\b\d[\d,]*\.\d{1,2}\b/g, replacement: '[redacted-amount]' },
  // Telephone shapes, international or grouped.
  { pattern: /\+?\d[\d\s().-]{7,}\d/g, replacement: '[redacted-number]' },
  // Any remaining run of four or more digits: postcodes, account numbers, ids,
  // bare totals. Runs of one to three digits survive, so HTTP statuses, retry
  // attempts and array lengths stay readable.
  { pattern: /\b\d{4,}\b/g, replacement: '[redacted-number]' },
]

const PATH_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  // Home directories carry the operator's name and, further along, often the
  // customer's original filename (`.../Desktop/Fitzwilliam-survey.heic`). The
  // whole run goes, not just the user segment: the interesting part of a path
  // like that is which file operation failed, and that is in the error code,
  // not in the path.
  { pattern: /\/(?:Users|home)\/[^\s"'),;]*/g, replacement: '/[redacted-path]' },
  { pattern: /[A-Za-z]:\\Users\\[^\s"'),;]*/g, replacement: 'C:\\[redacted-path]' },
]

/**
 * Quoted spans containing whitespace. `"Margaret Fitzwilliam"` is a value;
 * `"P2002"` is a Prisma error code and stays, because a quoted token with no
 * space in it is almost always an identifier and is the most useful thing in
 * the line.
 */
const QUOTED_PHRASE = /(["'`])([^"'`\n]*\s[^"'`\n]*)\1/g

/**
 * Words that are capitalised for technical rather than personal reasons.
 * Deliberately short: every entry is a hole in layer 3, so it holds only
 * vocabulary that actually appears in runtime errors and in this product's own
 * canned copy. Compared lowercased.
 */
const TECHNICAL_VOCABULARY = new Set([
  // Product and stack
  'pool', 'forge', 'prisma', 'postgres', 'postgresql', 'neon', 'next', 'node',
  'react', 'vercel', 'google', 'vertex', 'gemini', 'zod', 'playwright', 'vitest',
  'docker', 'electron', 'sharp', 'auth', 'nextauth',
  // Error and HTTP vocabulary
  'error', 'errors', 'exception', 'failed', 'failure', 'cannot', 'could',
  'unable', 'invalid', 'unknown', 'unexpected', 'missing', 'timeout', 'timed',
  'aborted', 'rejected', 'refused', 'denied', 'forbidden', 'unauthorized',
  'unauthenticated', 'not', 'found', 'bad', 'gateway', 'internal', 'server',
  'client', 'service', 'unavailable', 'request', 'response', 'connection',
  'database', 'query', 'transaction', 'constraint', 'unique', 'foreign',
  'schema', 'validation', 'type', 'range', 'syntax', 'reference', 'assertion',
  'aggregate', 'network', 'socket', 'stream', 'buffer', 'json', 'http', 'https',
  'get', 'post', 'patch', 'put', 'delete', 'options', 'head',
  // Domain nouns that appear in this app's canned copy
  'project', 'projects', 'quote', 'quotes', 'proposal', 'proposals', 'command',
  'commands', 'organization', 'organisation', 'org', 'user', 'session',
  'import', 'imports', 'intake', 'export', 'exports', 'price', 'book', 'pricing',
  'measurement', 'measurements', 'editor', 'canvas', 'shape', 'voice',
  // Filler that shows up capitalised at the start of a sentence
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'there', 'it', 'no',
  'nothing', 'please', 'try', 'again', 'and', 'or', 'but', 'for', 'from', 'to',
  'in', 'on', 'at', 'of', 'with', 'without', 'while', 'when', 'after', 'before',
  'one', 'two', 'first', 'last', 'new', 'old', 'open', 'closed', 'read', 'write',
])

const NAME_REDACTION = '[redacted-name]'

/** A single capitalised word: `Margaret`, `Willow`, `Drive`. */
const SIMPLE_CAPITALISED = /^[A-Z][a-z]+(?:['’][A-Za-z]+)?$/

/** Splits a token into leading punctuation, an alphabetic core, and a tail. */
const TOKEN_SHAPE = /^([^A-Za-z]*)([A-Za-z][A-Za-z'’-]*)(.*)$/s

/**
 * Word separators for the proper-noun pass.
 *
 * Whitespace is not enough. A name hides inside a path segment
 * (`/srv/uploads/Fitzwilliam-survey.heic`), inside a comma-separated list, and
 * inside a hyphenated compound, and a scanner that only sees whitespace-
 * delimited tokens walks straight past all three. Splitting on the punctuation
 * that joins words, with the separators captured so the string rebuilds byte
 * for byte, makes each word visible on its own.
 */
const WORD_SEPARATORS = /([\s/\\_.,;:()[\]{}<>"'`|-]+)/

function redactProperNouns(text: string): string {
  const parts = text.split(WORD_SEPARATORS)
  let previousWasRedacted = false

  for (let i = 0; i < parts.length; i += 1) {
    const token = parts[i]
    if (token === undefined || token.length === 0) continue

    const shape = TOKEN_SHAPE.exec(token)
    if (shape === null) {
      previousWasRedacted = false
      continue
    }
    const lead = shape[1] ?? ''
    const core = shape[2] ?? ''
    const tail = shape[3] ?? ''

    // PascalCase with more than one hump (`TypeError`, `PrismaClientError`) and
    // ALL-CAPS tokens (`SQL`, `HTTP`) are technical by shape, never names.
    const isMultiHump = /[a-z][A-Z]/.test(core) || /^[A-Z]{2,}$/.test(core)
    if (isMultiHump || !SIMPLE_CAPITALISED.test(core)) {
      previousWasRedacted = false
      continue
    }
    if (TECHNICAL_VOCABULARY.has(core.toLowerCase())) {
      previousWasRedacted = false
      continue
    }

    // Collapse a run of redactions so "Margaret Fitzwilliam" reads as one
    // placeholder rather than two.
    parts[i] = previousWasRedacted && lead.length === 0 ? `${tail}` : `${lead}${NAME_REDACTION}${tail}`
    if (previousWasRedacted && lead.length === 0) {
      // Remove the separator that preceded this token as well.
      const separator = parts[i - 1]
      if (separator !== undefined && /^\s+$/.test(separator)) parts[i - 1] = ''
    }
    previousWasRedacted = true
  }

  return parts.join('')
}

function cap(text: string): string {
  if (text.length <= MAX_REDACTED_LENGTH) return text
  return `${text.slice(0, MAX_REDACTED_LENGTH)}...[truncated]`
}

/**
 * The single entry point. Accepts anything (a string, an `Error`, a thrown
 * object) and returns text that is safe to write to a log or hand to an alert
 * sink.
 *
 * Never throws: it runs on the failure path, so it must not create a second
 * failure. A redaction that itself blows up returns a placeholder.
 */
export function redactText(input: unknown): string {
  try {
    let text = scrubErrorText(input)
    for (const entry of PATH_PATTERNS) text = text.replace(entry.pattern, entry.replacement)
    text = text.replace(QUOTED_PHRASE, '[redacted-value]')
    for (const entry of AMOUNT_PATTERNS) text = text.replace(entry.pattern, entry.replacement)
    text = redactProperNouns(text)
    return cap(text)
  } catch {
    return '[redaction-failed]'
  }
}

/**
 * An error's class name, which is useful and is never customer text, as long as
 * it is confirmed to look like one. Anything else collapses to `Error`.
 */
export function redactErrorName(name: unknown): string {
  if (typeof name !== 'string') return 'Error'
  const trimmed = name.trim()
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(trimmed) ? trimmed : 'Error'
}

/**
 * Frames inside dependencies and inside the bundler's own machinery. In dev
 * these are hundreds of characters of `webpack-internal:///(rsc)/./node_modules
 * /.pnpm/next@15.5.15_.../next-app-loader/index.js?name=app%2Fapi%2F...` and
 * they push the frames that name your own code past the cap.
 */
const VENDOR_FRAME = /node_modules|webpack-internal|node:internal|\.pnpm/

/**
 * Stack frames, filtered, capped and redacted. Paths are the usual leak here:
 * an upload path carries the customer's original filename and a home directory
 * carries somebody's name.
 */
export function redactStack(stack: unknown, maxFrames = 12): string[] {
  if (typeof stack !== 'string' || stack.length === 0) return []
  const lines = stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  // Keep the message line (frame 0) whatever it is, then only frames naming
  // code in this repository.
  const head = lines.slice(0, 1)
  const own = lines.slice(1).filter((line) => !VENDOR_FRAME.test(line))
  return [...head, ...own].slice(0, maxFrames).map((line) => redactText(line))
}

/**
 * Path segments that are identifiers get masked, and the query string is
 * dropped whole. `/projects/clx8f2.../proposal?customer=Margaret+Fitzwilliam`
 * becomes `/projects/:id/proposal`. A URL is one of the easiest ways for
 * customer data to reach a log without anyone deciding to put it there.
 */
export function maskRoute(input: unknown): string | null {
  if (typeof input !== 'string' || input.length === 0) return null
  let pathname = input
  try {
    pathname = new URL(input, 'http://internal.invalid').pathname
  } catch {
    const cut = pathname.search(/[?#]/)
    if (cut >= 0) pathname = pathname.slice(0, cut)
  }
  const segments = pathname.split('/').map((segment) => {
    if (segment.length === 0) return segment
    const looksLikeId =
      /^\d+$/.test(segment) ||
      /^[0-9a-f]{8,}$/i.test(segment) ||
      /^c[a-z0-9]{20,}$/i.test(segment) ||
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
      segment.length > 40
    return looksLikeId ? ':id' : segment
  })
  const masked = segments.join('/')
  return masked.length > 0 ? masked.slice(0, 200) : '/'
}
