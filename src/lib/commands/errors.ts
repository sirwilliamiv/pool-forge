// Turning a failed command into a sentence a builder can act on.
//
// The error string a command returns is not a log line: it goes straight into a
// toast in front of whoever clicked. A first-run reviewer clicked "Add 2 LED
// lights" and was shown, verbatim,
//
//     invalid input: stencilId: Required; x: Required; y: Required
//
// which tells a person nothing they can do anything about, and reads like the
// product is broken (it was). The technical detail still matters — it is what
// says which field was wrong — so it is kept, on the audit row and in the server
// log, and only the user-facing half is rewritten.

import type { ZodError, ZodIssue } from 'zod'

/** Developer-facing: every failing path and why. Goes to the audit row. */
export function technicalIssueList(error: ZodError): string {
  return error.issues.map(issue => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ')
}

/** `depthShallow` → "depth shallow"; `pool.0.width` → "pool width". */
function fieldWords(issue: ZodIssue): string {
  const leaf = issue.path.filter(part => typeof part === 'string').pop()
  if (typeof leaf !== 'string' || leaf.length === 0) return 'value'
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .toLowerCase()
}

function list(words: string[]): string {
  const unique = [...new Set(words)]
  if (unique.length <= 1) return unique[0] ?? 'something'
  const last = unique[unique.length - 1] as string
  return `${unique.slice(0, -1).join(', ')} and ${last}`
}

/**
 * Failures whose own message was written for the person, not the developer.
 *
 * A field that is simply absent has nothing useful to say beyond its name, and
 * that is the case the paragraph below already handled. A value that is out of
 * range is different: the schema knows the limit, so the message can name it,
 * and `src/lib/commands/dimensions.ts` writes those messages as sentences for
 * exactly that reason. Printing them verbatim is what puts "Pool length must be
 * between 1 and 400 feet" in front of somebody instead of "length ft is not
 * valid".
 */
const SPEAKS_FOR_ITSELF = new Set(['too_big', 'too_small', 'not_finite', 'custom'])

/**
 * `NaN` is the awkward one: it has the number type, so Zod reports it as an
 * `invalid_type` rather than a range failure, and it would otherwise fall
 * through to "length ft is missing or not valid". The bounded builders put the
 * range in that message too, so it is worth printing.
 */
function speaksForItself(issue: ZodIssue): boolean {
  if (SPEAKS_FOR_ITSELF.has(issue.code)) return true
  return issue.code === 'invalid_type' && 'received' in issue && issue.received === 'nan'
}

/** `4800` → `4,800`. Only used on what the caller sent back to them. */
function figure(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

/**
 * What the caller actually sent for a failing field, if it can be shown.
 *
 * "You entered 99,999" is the half of a refusal that makes it obvious which of
 * the four fields on screen was the problem. Only numbers and short strings are
 * echoed: anything else is an object the user never typed, and printing it
 * would be the Zod dump again in a different costume.
 */
function received(input: unknown, issue: ZodIssue): string | null {
  let cursor: unknown = input
  for (const step of issue.path) {
    if (cursor === null || typeof cursor !== 'object') return null
    cursor = (cursor as Record<string | number, unknown>)[step as string | number]
  }
  if (typeof cursor === 'number') {
    return Number.isFinite(cursor) ? figure(cursor) : String(cursor)
  }
  if (typeof cursor === 'string' && cursor.length > 0 && cursor.length <= 40) return `“${cursor}”`
  return null
}

/**
 * What to show the person who clicked.
 *
 * Names the action in the words the button used, says what was wrong in plain
 * language, and says whether anything changed — because "did that do something?"
 * is the question a silent failure leaves behind.
 *
 * `input` is what the caller sent, and is optional only so older call sites
 * keep compiling: pass it wherever it is to hand, because a refusal that quotes
 * the number back is the difference between "which box did I get wrong" and
 * "that one".
 */
export function humanCommandInputError(
  commandLabel: string,
  error: ZodError,
  input?: unknown,
): string {
  const spoken = error.issues.filter(speaksForItself)
  if (spoken.length > 0) {
    const sentences = spoken.map(issue => {
      const value = input === undefined ? null : received(input, issue)
      const tail = issue.message.trim().endsWith('.') ? '' : '.'
      return value === null
        ? `${issue.message}${tail}`
        : `${issue.message}${tail} You entered ${value}.`
    })
    return `“${commandLabel}” could not run. ${[...new Set(sentences)].join(
      ' ',
    )} Nothing was changed.`
  }

  const missing = error.issues.filter(
    issue => issue.code === 'invalid_type' && issue.message.toLowerCase().includes('required'),
  )

  if (missing.length > 0 && missing.length === error.issues.length) {
    return `“${commandLabel}” could not run: the app did not send ${list(
      missing.map(fieldWords),
    )}. Nothing was changed. Please try again, and report it if it keeps happening.`
  }

  return `“${commandLabel}” could not run: ${list(
    error.issues.map(fieldWords),
  )} ${error.issues.length > 1 ? 'are' : 'is'} missing or not valid. Nothing was changed.`
}

/** An id that no longer exists, or never did. Also user-facing. */
export function humanUnknownCommandError(): string {
  return 'That action is not available in this version of Pool Forge. Nothing was changed.'
}

/**
 * A command that threw rather than returning a failure.
 *
 * The message on a thrown error is a developer's sentence at best and, at
 * worst, quotes the row it choked on: a Prisma unique-constraint violation
 * names the value, which here means a customer's email or a job number. It used
 * to be returned to the browser verbatim. Now it is captured server-side by
 * `@/modules/monitoring`, redacted, and replaced with this, so the person on
 * site gets something they can read down the phone and support can find the
 * exact record with `grep <ref>`.
 */
export function humanCommandCrashError(commandLabel: string, errorRef: string): string {
  return (
    `“${commandLabel}” could not finish. Nothing was changed. ` +
    `Please try again, and quote reference ${errorRef} if it keeps happening.`
  )
}
