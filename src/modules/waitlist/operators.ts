// Who may read the waitlist.
//
// Not "any signed-in user", and not "any org owner". The list holds the email
// addresses, company names and current tooling of everybody who has asked to be
// let in, including builders who compete with each other. Every account in this
// beta belongs to one of those builders, so org membership is exactly the wrong
// test: it would let the first invited customer read the pipeline of prospects
// their competitors are in.
//
// So the list is operator data, and an operator is named by the deployment
// rather than by a row anybody can create. `WAITLIST_OPERATOR_EMAILS` is a
// comma-separated list of addresses.
//
// Unset means nobody, in every environment. The alternative (fall back to
// something permissive when the variable is missing) is how an unset variable
// in production quietly publishes the pipeline, and a deploy that forgot the
// variable should fail visibly at a 404 rather than invisibly at an open door.

const ENV_KEY = 'WAITLIST_OPERATOR_EMAILS'

/** Addresses allowed to read the waitlist. Lower-cased, blanks dropped. */
export function waitlistOperatorEmails(): string[] {
  const raw = process.env[ENV_KEY]
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
}

/** True only for an address the deployment named. An absent address is never an operator. */
export function isWaitlistOperator(email: string | null | undefined): boolean {
  if (typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  if (normalized.length === 0) return false
  return waitlistOperatorEmails().includes(normalized)
}
