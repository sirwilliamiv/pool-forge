/**
 * Whether a failure means this page is older than the server.
 *
 * Next names server actions by a content hash, so a deploy invalidates every id
 * an already-open tab is holding. The failure is total and permanent for that
 * tab: nothing it saves will ever land again, while the drawing keeps changing
 * on screen and looking fine.
 *
 * Worth telling apart from a network failure, because the advice is opposite.
 * "Check your connection" sends somebody to look at their wifi while their work
 * goes nowhere; a reload is the entire fix.
 *
 * Its own module so it can be tested. Reaching it through the component that
 * uses it drags in server actions and next-auth, which cannot load in a test
 * runner.
 */
export function isStaleBuild(error: unknown): boolean {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  return name === 'UnrecognizedActionError' || /was not found on the server/i.test(message)
}
