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
