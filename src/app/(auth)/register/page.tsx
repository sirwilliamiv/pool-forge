import { redirect } from 'next/navigation'

/**
 * Self-service registration is closed while Pool Forge is invite only.
 *
 * A redirect rather than a copy of the front door: two URLs serving the same
 * page is two pages to keep true, and every existing link and bookmark that
 * points at /register should land on the thing that replaced it. The page it
 * goes to is deliberately outside this route group, whose layout is a centred
 * `max-w-sm` card built for a sign-in form.
 */
export default function RegisterPage() {
  redirect('/request-access')
}
