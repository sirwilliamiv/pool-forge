// Getting JSON back out of a text response.
//
// The models wrap output in ```json fences, prepend a sentence of preamble, and
// occasionally truncate mid-object when they hit the output cap. None of that
// is an error worth a retry; it is a parsing problem, handled here so the
// repair round-trip is reserved for genuine schema failures.

export type JsonParseFailure =
  | 'empty'
  | 'no-object-found'
  | 'unterminated'
  | 'invalid-json'
  | 'not-an-object'

export type JsonParseResult =
  | { ok: true; value: Record<string, unknown>; text: string }
  | { ok: false; reason: JsonParseFailure }

/** Remove a leading ```json fence and its closing fence, if present. */
export function stripCodeFences(text: string): string {
  const fenced = /^\s*```(?:json|JSON)?\s*\n([\s\S]*?)(?:\n\s*```\s*)?$/.exec(text)
  if (fenced !== null && fenced[1] !== undefined) return fenced[1].trim()
  return text.trim()
}

/**
 * Find the first balanced top-level JSON object. String-aware so a brace inside
 * a quoted value does not close the object early.
 */
export function findJsonObject(text: string): { text: string; terminated: boolean } | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (char === undefined) break
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return { text: text.slice(start, i + 1), terminated: true }
    }
  }
  return { text: text.slice(start), terminated: false }
}

/**
 * Parse a model response into a plain object. Never throws: callers decide
 * whether a failure is worth the one repair round-trip they are allowed.
 */
export function parseModelJson(raw: string): JsonParseResult {
  if (raw.trim() === '') return { ok: false, reason: 'empty' }
  const unfenced = stripCodeFences(raw)
  const found = findJsonObject(unfenced)
  if (found === null) return { ok: false, reason: 'no-object-found' }
  if (!found.terminated) return { ok: false, reason: 'unterminated' }
  let parsed: unknown
  try {
    parsed = JSON.parse(found.text)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-an-object' }
  }
  return { ok: true, value: parsed as Record<string, unknown>, text: found.text }
}

export function describeParseFailure(reason: JsonParseFailure): string {
  switch (reason) {
    case 'empty':
      return 'the response was empty'
    case 'no-object-found':
      return 'the response contained no JSON object'
    case 'unterminated':
      return 'the JSON object was truncated before it closed'
    case 'invalid-json':
      return 'the response was not valid JSON'
    case 'not-an-object':
      return 'the response was valid JSON but not an object'
  }
}
