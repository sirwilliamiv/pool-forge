// The single repair round-trip.
//
// When a response fails to parse or fails Zod, the model gets exactly one more
// turn: its own output plus the precise reason it was rejected. Exactly one.
// A repair loop that can run twice is a repair loop that can run twenty times
// on a bad prompt, and the bill for that arrives before the alert does.

export const REPAIR_PROMPT_VERSION = 'repair@1.0.0'

export interface RepairPromptInput {
  /** Why the previous response was rejected, in plain language. */
  problem: string
  /** The Zod issue list, one per line, when the failure was schema validation. */
  issues: string[]
}

export function buildRepairPrompt(input: RepairPromptInput): string {
  const issueBlock =
    input.issues.length === 0
      ? '(no field-level detail available)'
      : input.issues.map((issue) => `- ${issue}`).join('\n')

  return `Your previous response was rejected. Reason: ${input.problem}

Field-level problems:
${issueBlock}

Correct your previous answer and return it again.

Rules for this second attempt:
1. Return one JSON object and nothing else. No prose before it, no prose after it, no markdown code fences.
2. Keep every value you were confident about. Only change what the problems above require.
3. Use null for anything you cannot read. Never invent a value to satisfy a field.
4. Use only the field names and enum values listed in the original instructions. Do not add fields.
5. Close every brace and bracket. If you are running long, shorten arrays rather than truncating the object.`
}

/** Text of the previous model turn, replayed so the model sees its own output. */
export function previousModelTurn(rawResponse: string): string {
  const trimmed = rawResponse.trim()
  if (trimmed === '') return '(empty response)'
  return trimmed
}
