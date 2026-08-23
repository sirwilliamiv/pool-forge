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
 * What to show the person who clicked.
 *
 * Names the action in the words the button used, says what was wrong in plain
 * language, and says whether anything changed — because "did that do something?"
 * is the question a silent failure leaves behind.
 */
export function humanCommandInputError(commandLabel: string, error: ZodError): string {
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
