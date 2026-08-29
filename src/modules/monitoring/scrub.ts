// Credential and identifier scrubbing for third-party error text.
//
// This used to live in `imports/vision/errors.ts`, next to the Vertex client
// that needed it first. It moved here for a concrete reason, not a tidiness
// one: `instrumentation.ts` is compiled for the edge runtime as well as the
// Node one, webpack analyses both branches of the runtime check whether or not
// they can execute, and `imports/vision/errors.ts` imports `node:crypto` for
// its ref generator. The result was a build failure on every request:
//
//   Module build failed: UnhandledSchemeError: Reading from "node:crypto" is
//   not handled by plugins (Unhandled scheme).
//
// So the scrubber is now a leaf module with no imports at all, and
// `imports/vision/errors.ts` re-exports it. Still one scrubber and one place to
// add a pattern to; it is simply at the bottom of the graph rather than the
// middle of it.

/** Patterns that have leaked credentials or PII out of API error text. */
const SCRUB_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: '[redacted-key]' },
  { pattern: /\bya29\.[A-Za-z0-9._-]+/g, replacement: '[redacted-token]' },
  { pattern: /\bAIza[A-Za-z0-9_-]{10,}/g, replacement: '[redacted-key]' },
  { pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: '[redacted-jwt]' },
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/-]+=*/g, replacement: 'Bearer [redacted]' },
  { pattern: /\bhttps?:\/\/\S*[?&](?:key|access_token|token)=\S+/gi, replacement: '[redacted-url]' },
  { pattern: /"data"\s*:\s*"[A-Za-z0-9+/=]{40,}"/g, replacement: '"data":"[redacted-inline-data]"' },
  { pattern: /\b(key|token|secret|password|authorization|api[_-]?key)\s*[=:]\s*"?[^\s",}]+/gi, replacement: '$1=[redacted]' },
  { pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, replacement: '[redacted-email]' },
  { pattern: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, replacement: '[redacted-ip]' },
]

/** Hard ceiling so a megabyte of echoed request body never reaches a log. */
const MAX_SCRUBBED_LENGTH = 600

/**
 * Reduce arbitrary third-party error text to something safe to log. Applied to
 * every provider error before it is written anywhere.
 */
export function scrubErrorText(input: unknown): string {
  let text: string
  if (typeof input === 'string') {
    text = input
  } else if (input instanceof Error) {
    text = `${input.name}: ${input.message}`
  } else {
    try {
      text = JSON.stringify(input) ?? '[unserializable]'
    } catch {
      text = '[unserializable]'
    }
  }
  // Truncate before scrubbing, not after. The patterns above are linear on a
  // bounded input and quadratic on an unbounded one, and an error carrying a
  // megabyte of echoed request body is exactly the case that would stall the
  // log path. Anything past the cap is dropped rather than redacted, which is
  // the safer of the two outcomes anyway.
  const overLength = text.length > MAX_SCRUBBED_LENGTH
  let scrubbed = overLength ? text.slice(0, MAX_SCRUBBED_LENGTH) : text
  for (const entry of SCRUB_PATTERNS) {
    scrubbed = scrubbed.replace(entry.pattern, entry.replacement)
  }
  if (overLength) scrubbed = `${scrubbed}...[truncated]`
  return scrubbed
}
