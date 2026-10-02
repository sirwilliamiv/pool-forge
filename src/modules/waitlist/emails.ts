// Waitlist confirmation and notification emails.
//
// Two emails go out on a successful new waitlist signup:
//
// 1. A thank-you to the submitter, branded with the Pool Forge visual identity
//    (paper background, black CTA, voice matching the outreach emails).
//
// 2. A notification to each address in WAITLIST_OPERATOR_EMAILS with the
//    submission details, so Billy gets pinged without checking /settings/waitlist.
//
// Both emails include plain text fallbacks for accessibility and mail clients
// that do not render HTML.

import type { Email } from '@/modules/email/send'
import { INK } from '@/lib/brand'
import type { WaitlistSignupInput } from './schema'
import { labelFor, TEAM_SIZE_OPTIONS, USES_TODAY_OPTIONS } from './schema'
import { waitlistOperatorEmails } from './operators'

const HERO_GIF_URL = 'https://pool-forge.com/email/hero-01.gif'
const HERO_ALT = 'Pool Forge — draw the pool, the price is already done.'

const PRODUCT_EDITOR_URL = 'https://pool-forge.com/product/editor'
const PRODUCT_EDITOR_LABEL = 'See the editor'

function operatorReplyAddress(): string | undefined {
  const emails = waitlistOperatorEmails()
  return emails[0]
}

function baseStyles(): string {
  return `
    body {
      margin: 0;
      padding: 0;
      background-color: ${INK.paper};
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: ${INK.warm};
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 24px;
    }
    .hero-img {
      display: block;
      width: 100%;
      max-width: 560px;
      height: auto;
      border-radius: 8px;
      margin: 0 auto 32px;
    }
    .heading {
      font-size: 28px;
      font-weight: 600;
      color: ${INK.black};
      margin: 0 0 16px;
      line-height: 1.2;
    }
    .body-text {
      font-size: 16px;
      margin: 0 0 16px;
    }
    .cta-btn {
      display: inline-block;
      background-color: ${INK.black};
      color: ${INK.white} !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 500;
      margin-top: 8px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 24px;
      border-top: 1px solid ${INK.mist};
      font-size: 14px;
      color: ${INK.slate};
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .data-table th,
    .data-table td {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid ${INK.mist};
    }
    .data-table th {
      font-weight: 500;
      color: ${INK.slate};
      width: 140px;
    }
  `
}

export function buildThankYouEmail(input: WaitlistSignupInput): Email {
  const name = input.name ?? 'there'
  const replyTo = operatorReplyAddress()

  const ctaHref = replyTo ? `mailto:${replyTo}?subject=Pool Forge waitlist` : PRODUCT_EDITOR_URL
  const ctaLabel = replyTo ? 'Reply to this email' : PRODUCT_EDITOR_LABEL

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thanks for signing up — Pool Forge</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="container">
    <img
      src="${HERO_GIF_URL}"
      alt="${HERO_ALT}"
      class="hero-img"
    />
    
    <h1 class="heading">Thanks, ${escapeHtml(name)}.</h1>
    
    <p class="body-text">
      You are on the list. We read every one of these ourselves, and if you fit
      the group we are onboarding now, you will hear from us directly.
    </p>
    
    <p class="body-text">
      If the timing is not right just yet, we will come back to you as we open up
      to more builders. Either way, your spot is saved.
    </p>
    
    <p class="body-text">
      In the meantime, if you have questions or want to tell us more about how
      you work today, just hit reply.
    </p>
    
    <a href="${ctaHref}" class="cta-btn">${ctaLabel}</a>
    
    <div class="footer">
      <p>Pool Forge — estimating software for pool builders.</p>
      <p>Draw the pool. The price is already done.</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  const text = `Thanks, ${name}.

You are on the list. We read every one of these ourselves, and if you fit the group we are onboarding now, you will hear from us directly.

If the timing is not right just yet, we will come back to you as we open up to more builders. Either way, your spot is saved.

In the meantime, if you have questions or want to tell us more about how you work today, just reply to this email.

---
Pool Forge — estimating software for pool builders.
Draw the pool. The price is already done.`

  return {
    to: input.email,
    subject: "You're on the list — Pool Forge",
    text,
    html,
  }
}

export interface OperatorNotifyData {
  name: string | undefined
  company: string | undefined
  email: string
  phone: string | undefined
  teamSize: string | undefined
  usesToday: string | undefined
  note: string | undefined
  source: string | undefined
}

function formatDataRow(label: string, value: string | undefined): string {
  if (!value) return ''
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
}

function formatTextRow(label: string, value: string | undefined): string {
  if (!value) return ''
  return `${label}: ${value}`
}

export function buildOperatorNotifyEmail(
  operatorEmail: string,
  data: OperatorNotifyData,
): Email {
  const teamSizeLabel = labelFor(TEAM_SIZE_OPTIONS, data.teamSize ?? null)
  const usesTodayLabel = labelFor(USES_TODAY_OPTIONS, data.usesToday ?? null)

  const htmlRows = [
    formatDataRow('Name', data.name),
    formatDataRow('Company', data.company),
    formatDataRow('Email', data.email),
    formatDataRow('Phone', data.phone),
    formatDataRow('Team size', teamSizeLabel || data.teamSize),
    formatDataRow('Uses today', usesTodayLabel || data.usesToday),
    formatDataRow('Note', data.note),
    formatDataRow('Source', data.source),
  ]
    .filter(Boolean)
    .join('\n')

  const textRows = [
    formatTextRow('Name', data.name),
    formatTextRow('Company', data.company),
    formatTextRow('Email', data.email),
    formatTextRow('Phone', data.phone),
    formatTextRow('Team size', teamSizeLabel || data.teamSize),
    formatTextRow('Uses today', usesTodayLabel || data.usesToday),
    formatTextRow('Note', data.note),
    formatTextRow('Source', data.source),
  ]
    .filter(Boolean)
    .join('\n')

  const companyOrName = data.company ?? data.name ?? 'Someone'

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>New waitlist signup — Pool Forge</title>
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="container">
    <h1 class="heading">New waitlist signup</h1>
    
    <p class="body-text">
      ${escapeHtml(companyOrName)} just signed up for the waitlist.
    </p>
    
    <table class="data-table">
      <tbody>
        ${htmlRows}
      </tbody>
    </table>
    
    <a href="https://pool-forge.com/settings/waitlist" class="cta-btn">View waitlist</a>
    
    <div class="footer">
      <p>You are receiving this because you are listed in WAITLIST_OPERATOR_EMAILS.</p>
    </div>
  </div>
</body>
</html>
  `.trim()

  const text = `New waitlist signup

${companyOrName} just signed up for the waitlist.

${textRows}

---
View waitlist: https://pool-forge.com/settings/waitlist`

  return {
    to: operatorEmail,
    subject: `Waitlist: ${companyOrName}`,
    text,
    html,
  }
}

export function getOperatorEmails(): string[] {
  return waitlistOperatorEmails()
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
