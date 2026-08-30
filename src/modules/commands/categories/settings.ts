import { z } from 'zod'
import { register } from '@/modules/commands/registry'
import {
  companySettingsSchema,
  normalizeBrandColor,
  normalizeLogoUrl,
  scheduleBalances,
  scheduleTotalPercent,
} from '@/modules/organization/company'

register({
  id: 'settings.update',
  label: 'Update setting',
  description: 'Update an organization-scoped application setting by key.',
  category: 'settings',
  inputSchema: z.object({
    key: z.string().min(1),
    value: z.unknown(),
  }),
  outputSchema: z.object({
    key: z.string(),
  }),
  voiceExamples: [
    'Update the default deck material to pavers.',
    'Change my company default coping color.',
  ],
  unimplemented: true,
  execute: async () => ({ ok: false, error: 'not implemented' }),
})

// The business behind the paperwork.
//
// Company settings used to be a server action writing four columns straight to
// Prisma, which is exactly the bypass `CLAUDE.md` forbids: no audit row, so
// "who changed our licence number" had no answer. It dispatches like everything
// else now.
//
// Deliberately no `voiceExamples`. The converter refuses a command with none,
// so the agent is never offered this: a licence number, a terms paragraph and a
// draw schedule are contract content, and rewriting them from audio the model
// may have misheard is not a mistake a builder would find until a customer had
// already signed the result.
//
// Task 12's brief asked for two examples here ('Set our sales tax to 7
// percent.', 'Make proposals valid for 45 days.'), on the theory that a
// builder only ever means to touch two fields by voice. The input schema does
// not agree: it is one all-or-nothing object covering the licence number and
// the terms paragraph too, and `organization/company-settings.test.ts`
// ("is never offered to the voice agent") pins the original decision. Left
// unchanged rather than silently overriding a tested safety invariant; a
// narrower, voice-only input for just tax rate and validity window is the
// real way to grant this, and belongs in its own reviewed change.
register({
  id: 'settings.company.update',
  label: 'Update company settings',
  description:
    'Save the organization business details that print on customer documents: name, branding, ' +
    'address, phone, email, contractor licence number, default sales tax, proposal validity ' +
    'window, payment schedule and proposal terms.',
  category: 'settings',
  inputSchema: companySettingsSchema,
  outputSchema: z.object({
    name: z.string(),
    /** Echoed back so the form can show what was actually stored. */
    paymentStages: z.number(),
  }),
  execute: async (input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }

    const brandColor = normalizeBrandColor(input.brandColor)
    if (input.brandColor.trim() && !brandColor) {
      return { ok: false, error: 'Brand colour must be a hex value like #0284c7.' }
    }

    const logoUrl = normalizeLogoUrl(input.logoUrl)
    if (input.logoUrl.trim() && !logoUrl) {
      return { ok: false, error: 'The logo must be an https link or a data:image URL.' }
    }

    // A schedule that does not add up to the contract is a schedule that will
    // be argued about. Refused here rather than printed with a total that does
    // not match the number in bold at the bottom of the proposal.
    if (!scheduleBalances(input.paymentSchedule)) {
      const pct = scheduleTotalPercent(input.paymentSchedule)
      return {
        ok: false,
        error: `The payment schedule adds up to ${pct.toFixed(2)}%, not 100%. Adjust the stages so they cover the whole contract.`,
      }
    }

    const { db } = await import('@/lib/db')
    await db.organization.update({
      where: { id: ctx.orgId },
      data: {
        name: input.name,
        logoUrl,
        brandColor,
        taxRatePct: input.taxRatePct,
        address: input.address || null,
        phone: input.phone || null,
        email: input.email || null,
        licenseNumber: input.licenseNumber || null,
        proposalTerms: input.proposalTerms || null,
        proposalValidDays: input.proposalValidDays,
        paymentSchedule: input.paymentSchedule,
      },
    })

    return { ok: true, data: { name: input.name, paymentStages: input.paymentSchedule.length } }
  },
})

/**
 * Read-back for "who is on my team". Lives here, in `settings.ts`, under the
 * `settings` category, rather than in `team.ts`, which is voiceless by
 * decision: mutating a role or removing somebody is not something a misheard
 * word should trigger. Reading the roster carries none of that risk, so it
 * gets a spoken form; the mutations next door still do not.
 *
 * No email addresses in the answer. Names and roles only, so nothing sensitive
 * lands in a voice transcript.
 */
register({
  id: 'settings.team.describe',
  label: 'Describe the team',
  description:
    'Report who is on this organization: each member\'s name and role, how many owners there ' +
    'are, and how many invites are still pending. Read-only, and never includes an email ' +
    'address.',
  category: 'settings',
  inputSchema: z.object({}),
  outputSchema: z.object({
    members: z.array(z.object({ name: z.string(), role: z.enum(['OWNER', 'ADMIN', 'MEMBER']) })),
    ownerCount: z.number(),
    pendingInvites: z.number(),
  }),
  voiceExamples: ['Who is on my team?', 'Any invites still pending?'],
  execute: async (_input, ctx) => {
    if (!ctx.orgId || ctx.orgId === 'anonymous') return { ok: false, error: 'Not authenticated' }
    const orgId = ctx.orgId

    const { listMembers, countOwners } = await import('@/modules/invites/team')
    const { listPendingInvites } = await import('@/modules/invites/invites')

    const [members, ownerCount, pendingInvites] = await Promise.all([
      listMembers(orgId),
      countOwners(orgId),
      listPendingInvites(orgId),
    ])

    return {
      ok: true,
      data: {
        members: members.map(m => ({ name: m.name ?? 'Unnamed', role: m.role })),
        ownerCount,
        pendingInvites: pendingInvites.length,
      },
    }
  },
})
